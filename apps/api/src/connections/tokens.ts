import { type Actor, UpstreamFailure } from "@pc/domain"
import { Clock, Context, Effect, Layer, Option } from "effect"
import { AuditLog } from "../audit/audit-log"
import { systemActor } from "../audit/actor"
import { TokenEndpoint } from "../integrations/oauth/token-endpoint"
import { needsRefresh, tokenSetFrom } from "../integrations/oauth/token-set"
import { Secrets } from "../secrets/secrets"
import { ConnectionsRepo, type StoredConnection } from "./connections-repo"
import type { StoredOAuth } from "./credential"
import { oauthClientOf } from "./oauth/client"
import { ConnectionVault } from "./vault"

const refresher = systemActor("oauth-refresh")

/**
 * OAuth tokens of connections: refreshed shortly before they expire, or on demand after the upstream answered
 * 401. Writes compare-and-swap on the row's version, so of two concurrent refreshes one wins and the other
 * uses the winner's tokens. A refused refresh marks the connection `needs_reauth` and is audited.
 */
export class ConnectionTokens extends Context.Service<ConnectionTokens, {
  readonly current: (stored: StoredConnection, credential: StoredOAuth, actor: Actor, force: boolean) => Effect.Effect<StoredOAuth, UpstreamFailure>
}>()("api/connections/ConnectionTokens") {
  static readonly layer = Layer.effect(
    ConnectionTokens,
    Effect.gen(function*() {
      const repo = yield* ConnectionsRepo
      const vault = yield* ConnectionVault
      const endpoint = yield* TokenEndpoint
      const secrets = yield* Secrets
      const audit = yield* AuditLog

      const failure = (message: string) => new UpstreamFailure({ upstream: "oauth", message })

      /** Another call refreshed since `stored` was read: use its tokens. */
      const newer = (stored: StoredConnection, actor: Actor) =>
        Effect.gen(function*() {
          const { connection } = stored
          const latest = yield* repo.find(connection.orgId, connection.resourceId, connection.userId)
          if (Option.isNone(latest) || latest.value.version === stored.version) return Option.none<StoredOAuth>()
          const opened = yield* vault.open(latest.value, "upstream_auth", actor)
          return opened.type === "oauth" ? Option.some(opened) : Option.none<StoredOAuth>()
        })

      const reauthNeeded = (stored: StoredConnection, reason: string) =>
        Effect.gen(function*() {
          const { connection } = stored
          yield* repo.markNeedsReauth(connection.id)
          yield* audit.record({
            orgId: connection.orgId,
            type: "connection.refreshed_failed",
            actor: refresher,
            target: { type: "resource", id: connection.resourceId },
            data: { connectionId: connection.id, mode: connection.mode, userId: connection.userId, reason }
          })
          return yield* failure("the provider no longer accepts this account's tokens; connect the account again")
        })

      const refresh = Effect.fn("ConnectionTokens.refresh")(function*(stored: StoredConnection, credential: StoredOAuth, actor: Actor) {
        const refreshToken = credential.tokens.refreshToken
        if (refreshToken === undefined) return yield* reauthNeeded(stored, "no_refresh_token")
        const client = yield* oauthClientOf(stored.connection.orgId, credential.client, actor).pipe(Effect.provideService(Secrets, secrets))
        const grant = { grant_type: "refresh_token", refresh_token: refreshToken, ...(credential.resource === undefined ? {} : { resource: credential.resource }) }
        const response = yield* Effect.result(endpoint.request(credential.refreshUrl ?? credential.tokenUrl, client, grant))
        if (response._tag === "Failure") {
          const raced = yield* newer(stored, actor)
          if (Option.isSome(raced)) return raced.value
          if (response.failure.revoked) return yield* reauthNeeded(stored, "refresh_rejected")
          return yield* failure("could not refresh the OAuth token")
        }
        const tokens = yield* tokenSetFrom(response.success, yield* Clock.currentTimeMillis, credential.tokens).pipe(
          Effect.mapError(() => failure("the provider's token response had no access token"))
        )
        const next: StoredOAuth = { ...credential, tokens }
        if (yield* repo.replaceCredential(stored, yield* vault.seal(next))) {
          const { connection } = stored
          yield* audit.record({
            orgId: connection.orgId,
            type: "secret.rotated",
            actor: refresher,
            target: { type: "connection", id: connection.id },
            data: { reason: "oauth_refresh", resourceId: connection.resourceId }
          })
          return next
        }
        return Option.getOrElse(yield* newer(stored, actor), () => next)
      })

      return ConnectionTokens.of({
        current: Effect.fn("ConnectionTokens.current")(function*(stored: StoredConnection, credential: StoredOAuth, actor: Actor, force: boolean) {
          const stale = force || needsRefresh(credential.tokens, yield* Clock.currentTimeMillis)
          yield* Effect.annotateCurrentSpan({ "oauth.refresh": stale, "oauth.forced": force })
          return stale ? yield* refresh(stored, credential, actor) : credential
        })
      })
    })
  )
}

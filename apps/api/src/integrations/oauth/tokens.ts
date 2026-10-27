import { type Actor, type Resource, type ResourceId, UpstreamFailure, type UserId } from "@pc/domain"
import { Clock, Context, Effect, Layer, Redacted, Schema } from "effect"
import { AuditLog } from "../../audit/audit-log"
import { ResourcesRepo } from "../../resources/resources-repo"
import { Secrets } from "../../secrets/secrets"
import { clientOf, type OAuthApp } from "./app"
import { needsRefresh, type OAuthTokenSet, OAuthTokenSetJson, tokenSetFrom } from "./token-set"
import { TokenEndpoint } from "./token-endpoint"
import { tokenSecretOf } from "./token-secret"

const refresher: Actor = { type: "system", id: "oauth-refresh" }

/**
 * OAuth2 tokens of integrations. Reads are audited secret reads; an expiring token is refreshed (and the new
 * set stored as a new secret version) before a run. Concurrent refreshes are tolerated: when a refresh
 * fails, the latest stored version is used if another call already refreshed it.
 */
export class OAuthTokens extends Context.Service<OAuthTokens, {
  readonly current: (app: OAuthApp, actor: Actor) => Effect.Effect<OAuthTokenSet, UpstreamFailure>
  /** Stores a fresh token set, creating the managed token secret on first connect. Returns its id. */
  readonly save: (app: OAuthApp, tokens: OAuthTokenSet, by: UserId) => Effect.Effect<ResourceId>
}>()("api/integrations/OAuthTokens") {
  static readonly layer = Layer.effect(
    OAuthTokens,
    Effect.gen(function*() {
      const secrets = yield* Secrets
      const endpoint = yield* TokenEndpoint
      const repo = yield* ResourcesRepo
      const audit = yield* AuditLog
      const encode = Schema.encodeEffect(OAuthTokenSetJson)

      const failure = (resource: Resource, message: string) => new UpstreamFailure({ upstream: resource.name, message })

      const read = (app: OAuthApp, secretId: ResourceId, actor: Actor) =>
        secrets.reveal(app.resource.orgId, secretId, "upstream_auth", actor).pipe(
          Effect.flatMap((plaintext) => Schema.decodeUnknownEffect(OAuthTokenSetJson)(Redacted.value(plaintext))),
          Effect.mapError(() => failure(app.resource, "the stored OAuth token is missing or unreadable; connect the integration again"))
        )

      const markNeedsReauth = (app: OAuthApp, reason: string) =>
        Effect.gen(function*() {
          const config = { ...app.config, connection: { ...app.connection, status: "needs_reauth" as const } }
          yield* repo.update({ ...app.resource, config }).pipe(Effect.orDie)
          const target = { type: "resource" as const, id: app.resource.id }
          yield* audit.record({ orgId: app.resource.orgId, type: "integration.connection_failed", actor: refresher, target, data: { reason } })
        })

      const refresh = Effect.fn("OAuthTokens.refresh")(function*(app: OAuthApp, secretId: ResourceId, stale: OAuthTokenSet, actor: Actor) {
        const client = yield* clientOf(app, actor).pipe(Effect.provideService(Secrets, secrets))
        const grant = { grant_type: "refresh_token", refresh_token: stale.refreshToken ?? "" }
        const response = yield* Effect.result(endpoint.request(app.refreshUrl, client, grant))
        if (response._tag === "Failure") {
          const latest = yield* read(app, secretId, actor)
          if (!needsRefresh(latest, yield* Clock.currentTimeMillis)) return latest
          if (response.failure.revoked) yield* markNeedsReauth(app, "refresh_rejected")
          return yield* failure(app.resource, response.failure.revoked ? "the provider revoked access; an admin must connect the integration again" : "could not refresh the OAuth token")
        }
        const fresh = yield* tokenSetFrom(response.success, yield* Clock.currentTimeMillis, stale).pipe(
          Effect.mapError(() => failure(app.resource, "the provider's token response had no access token"))
        )
        yield* secrets.store(secretId, Redacted.make(yield* Effect.orDie(encode(fresh))), "system:oauth-refresh")
        yield* audit.record({ orgId: app.resource.orgId, type: "secret.rotated", actor: refresher, target: { type: "resource", id: secretId }, data: { reason: "oauth_refresh", integrationId: app.resource.id } })
        return fresh
      })

      return OAuthTokens.of({
        current: Effect.fn("OAuthTokens.current")(function*(app: OAuthApp, actor: Actor) {
          const secretId = app.connection.tokenSecretId
          if (app.connection.status !== "connected" || secretId === undefined) return yield* failure(app.resource, "the integration is not connected")
          const tokens = yield* read(app, secretId, actor)
          return needsRefresh(tokens, yield* Clock.currentTimeMillis) ? yield* refresh(app, secretId, tokens, actor) : tokens
        }),
        save: Effect.fn("OAuthTokens.save")(function*(app: OAuthApp, tokens: OAuthTokenSet, by: UserId) {
          const secretId = yield* tokenSecretOf(app, by).pipe(Effect.provideService(ResourcesRepo, repo))
          yield* secrets.store(secretId, Redacted.make(yield* Effect.orDie(encode(tokens))), by)
          return secretId
        })
      })
    })
  )
}

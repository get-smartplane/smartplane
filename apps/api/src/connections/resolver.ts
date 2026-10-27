import { AccountNotConnected, accountModeOf, type Actor, type ConnectionContext, type Principal, type Resource, type UpstreamFailure, type UserId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { AppConfig } from "../platform/config"
import { ConnectionsRepo, type StoredConnection } from "./connections-repo"
import type { StoredCredential } from "./credential"
import { connectMethodOf } from "./method"
import { ConnectionTokens } from "./tokens"
import { ConnectionVault } from "./vault"

/** The dashboard page where a resource's account is connected: the resource page (shared) or the caller's own list. */
export const connectPage = (appUrl: string, resource: Resource): string =>
  accountModeOf(resource.config) === "per_user" ? `${appUrl}/connections?resource=${resource.id}` : `${appUrl}/resources/${resource.id}`

/**
 * Which account a call goes through. `context` reads only metadata (mode, the provider's account identity, who
 * connected it), so guards and audit see the account before any credential is touched; `credential` opens
 * the encrypted credential of the caller's own connection (per-user) or the shared one, and nobody else's.
 */
export class ConnectionResolver extends Context.Service<ConnectionResolver, {
  readonly context: (resource: Resource, principal: Principal) => Effect.Effect<ConnectionContext | null, AccountNotConnected>
  /** For connection-backed resources only. `force` refreshes OAuth tokens even if unexpired (the upstream said 401). */
  readonly credential: (resource: Resource, principal: Principal, actor: Actor, force?: boolean) => Effect.Effect<StoredCredential, UpstreamFailure | AccountNotConnected>
}>()("api/connections/ConnectionResolver") {
  static readonly layer = Layer.effect(
    ConnectionResolver,
    Effect.gen(function*() {
      const repo = yield* ConnectionsRepo
      const vault = yield* ConnectionVault
      const tokens = yield* ConnectionTokens
      const appUrl = (yield* AppConfig).APP_URL

      const notConnected = (resource: Resource) =>
        new AccountNotConnected({
          resourceId: resource.id,
          resourceName: resource.name,
          connectUrl: connectPage(appUrl, resource),
          shared: accountModeOf(resource.config) === "shared"
        })

      /** Service accounts have no account of their own to connect. */
      const ownerOf = (resource: Resource, principal: Principal): Effect.Effect<UserId | null, AccountNotConnected> => {
        if (accountModeOf(resource.config) === "shared") return Effect.succeed(null)
        return principal._tag === "User" ? Effect.succeed(principal.userId) : Effect.fail(notConnected(resource))
      }

      const live = (resource: Resource, principal: Principal): Effect.Effect<StoredConnection, AccountNotConnected> =>
        Effect.gen(function*() {
          const found = yield* repo.find(resource.orgId, resource.id, yield* ownerOf(resource, principal))
          if (Option.isNone(found) || found.value.connection.status !== "connected" || found.value.connection.mode !== accountModeOf(resource.config)) {
            return yield* notConnected(resource)
          }
          return found.value
        })

      const context = Effect.fn("ConnectionResolver.context")(function*(resource: Resource, principal: Principal) {
        const method = connectMethodOf(resource.config)
        const mode = accountModeOf(resource.config)
        yield* Effect.annotateCurrentSpan({ "connection.method": method, "connection.mode": mode })
        if (method === "none") return null
        if (method === "secret_reference") return { mode, accountIdentity: null, connectedBy: null } satisfies ConnectionContext
        const config = resource.config
        // A shared integration keeps its tokens in its managed secret and its status in its config; its row (if
        // it was connected after connections existed) only describes the account.
        if (config.kind === "integration" && config.connection.type === "oauth2" && mode === "shared") {
          if (config.connection.status !== "connected") return yield* notConnected(resource)
          const row = Option.getOrUndefined(yield* repo.find(resource.orgId, resource.id, null))?.connection
          return { mode, accountIdentity: row?.accountIdentity ?? null, connectedBy: row?.connectedBy ?? null } satisfies ConnectionContext
        }
        const { connection } = yield* live(resource, principal)
        return { mode, accountIdentity: connection.accountIdentity, connectedBy: connection.connectedBy } satisfies ConnectionContext
      })

      const credential = Effect.fn("ConnectionResolver.credential")(function*(resource: Resource, principal: Principal, actor: Actor, force = false) {
        const stored = yield* live(resource, principal)
        const opened = yield* vault.open(stored, "upstream_auth", actor)
        return opened.type === "oauth" ? yield* tokens.current(stored, opened, actor, force) : opened
      })

      return ConnectionResolver.of({ context, credential })
    })
  )
}

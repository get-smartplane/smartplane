import { accountModeOf, type Connection, type ConnectionCallbackFailure, type Principal, type Resource } from "@pc/domain"
import { Clock, Context, DateTime, Effect, Layer, Option } from "effect"
import { HttpClient } from "effect/http"
import { AuditLog } from "../../audit/audit-log"
import { actorOf } from "../../audit/actor"
import type { CallbackQuery } from "../../integrations/oauth/callback"
import { TokenEndpoint } from "../../integrations/oauth/token-endpoint"
import { tokenSetFrom } from "../../integrations/oauth/token-set"
import { upstreamToolsKey, upstreamUserToolsKey } from "../../mcp/cache-keys"
import { AppConfig } from "../../platform/config"
import { Ids } from "../../platform/ids"
import { KvCache } from "../../platform/kv"
import { ResourcesRepo } from "../../resources/resources-repo"
import { Secrets } from "../../secrets/secrets"
import { ConnectionsRepo } from "../connections-repo"
import type { StoredOAuth } from "../credential"
import { ConnectionVault } from "../vault"
import { oauthClientOf } from "./client"
import { accountIdentityOf } from "./identity"
import { type PendingConnection, PendingConnections } from "./pending"
import { withPinnedAuthServer } from "./pin"
import { authFingerprint } from "./plan"
import { connectionCallbackPath } from "./start"

/**
 * Finishes a connection sign-in: exchanges the code (with the PKCE verifier and `resource` indicator), learns
 * the account's identity, stores the tokens envelope-encrypted and audits `connection.connected`.
 */
export class ConnectionCallback extends Context.Service<ConnectionCallback, {
  /** Returns where to send the browser. `session` must be the dashboard session that started the flow. */
  readonly complete: (query: CallbackQuery, session: Option.Option<Principal>) => Effect.Effect<string>
}>()("api/connections/ConnectionCallback") {
  static readonly layer = Layer.effect(
    ConnectionCallback,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const pendings = yield* PendingConnections
      const resources = yield* ResourcesRepo
      const connections = yield* ConnectionsRepo
      const vault = yield* ConnectionVault
      const endpoint = yield* TokenEndpoint
      const secrets = yield* Secrets
      const http = yield* HttpClient.HttpClient
      const cache = yield* KvCache
      const audit = yield* AuditLog
      const redirectUri = `${config.API_URL}${connectionCallbackPath}`

      const page = (pending: PendingConnection | null, outcome: "connected" | ConnectionCallbackFailure) => {
        const result = outcome === "connected" ? "connection=connected" : `connection=error&reason=${outcome}`
        if (pending === null) return `${config.APP_URL}/connections?${result}`
        if (pending.returnTo === "setup") return `${config.APP_URL}/setup?step=tool&resource=${pending.resourceId}&${result}`
        if (pending.returnTo === "integrations") return `${config.APP_URL}/integrations?resource=${pending.resourceId}&${result}`
        return pending.owner === null
          ? `${config.APP_URL}/resources/${pending.resourceId}?${result}`
          : `${config.APP_URL}/connections?resource=${pending.resourceId}&${result}`
      }

      const exchange = (pending: PendingConnection, code: string, principal: Principal) =>
        Effect.gen(function*() {
          const client = yield* oauthClientOf(pending.orgId, pending.client, actorOf(principal)).pipe(Effect.provideService(Secrets, secrets))
          const grant = {
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            ...(pending.codeVerifier === null ? {} : { code_verifier: pending.codeVerifier }),
            ...(pending.resource === undefined ? {} : { resource: pending.resource })
          }
          return yield* tokenSetFrom(yield* endpoint.request(pending.tokenUrl, client, grant), yield* Clock.currentTimeMillis)
        }).pipe(Effect.option)

      /** First success with an admin-supplied client: from now on only this authorization server may be used. */
      const pin = (principal: Principal, resource: Resource, pending: PendingConnection) =>
        Effect.gen(function*() {
          // Re-read so an edit made while the user was signing in is not overwritten.
          const latest = Option.filter(yield* resources.find(resource.orgId, resource.id), (found) => authFingerprint(found) === pending.fingerprint)
          const pinned = Option.flatMap(latest, (found) => withPinnedAuthServer(found, pending.issuer, pending.tokenUrl))
          if (Option.isNone(pinned)) return
          yield* resources.update(pinned.value).pipe(Effect.orDie)
          yield* audit.by(principal, "resource.updated", { type: "resource", id: resource.id }, {
            fields: ["config"],
            pinnedIssuer: pending.issuer ?? null,
            pinnedTokenEndpoint: pending.tokenUrl
          })
        })

      const complete = Effect.fn("ConnectionCallback.complete")(function*(query: CallbackQuery, session: Option.Option<Principal>) {
        const found = query.state === undefined ? Option.none() : yield* pendings.take(query.state)
        if (Option.isNone(found)) return page(null, "expired_state")
        const pending = found.value
        const principal = Option.getOrUndefined(Option.filter(session, (p) => p._tag === "User" && p.userId === pending.userId && p.orgId === pending.orgId))
        if (principal === undefined || principal._tag !== "User") return page(pending, "session_mismatch")
        if (query.error !== undefined || query.code === undefined) return page(pending, "denied")
        const resource = Option.getOrUndefined(yield* resources.find(pending.orgId, pending.resourceId))
        if (resource === undefined || authFingerprint(resource) !== pending.fingerprint) return page(pending, "resource_changed")

        const tokens = yield* exchange(pending, query.code, principal)
        if (Option.isNone(tokens)) return page(pending, "exchange_failed")
        const credential: StoredOAuth = {
          type: "oauth",
          tokens: tokens.value,
          client: pending.client,
          tokenUrl: pending.tokenUrl,
          ...(pending.refreshUrl === undefined ? {} : { refreshUrl: pending.refreshUrl }),
          ...(pending.resource === undefined ? {} : { resource: pending.resource })
        }
        const accountIdentity = yield* Effect.provideService(accountIdentityOf(tokens.value, pending.userinfoUrl), HttpClient.HttpClient, http)
        const connection: Connection = {
          id: yield* Ids.connection,
          orgId: pending.orgId,
          resourceId: resource.id,
          mode: accountModeOf(resource.config),
          userId: pending.owner,
          method: "oauth",
          status: "connected",
          accountIdentity,
          connectedBy: { userId: principal.userId, email: principal.email },
          connectedAt: yield* DateTime.now,
          refreshedAt: null
        }
        yield* connections.put(connection, yield* vault.seal(credential))
        // A new account may see other tools than the one it replaces.
        yield* cache.remove(pending.owner === null ? upstreamToolsKey(resource.id) : upstreamUserToolsKey(resource.id, pending.owner))
        yield* pin(principal, resource, pending)
        yield* audit.by(principal, "connection.connected", { type: "resource", id: resource.id }, {
          connectionId: connection.id,
          mode: connection.mode,
          method: "oauth",
          accountIdentity,
          scope: tokens.value.scope,
          refreshable: tokens.value.refreshToken !== undefined
        })
        return page(pending, "connected")
      })

      return ConnectionCallback.of({ complete })
    })
  )
}

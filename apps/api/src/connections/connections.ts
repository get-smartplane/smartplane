import {
  type AccountMode,
  accountModeOf,
  type AuthorizationServerChanged,
  type Connection,
  type ConnectSecret,
  Forbidden,
  hasPermission,
  InvalidInput,
  type MyConnection,
  NotFound,
  type OAuthSettings,
  type OAuthStart,
  type Principal,
  type Resource,
  type ResourceConnections,
  type ResourceId,
  type SetAccountMode,
  type UpstreamFailure
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Redacted, Schema } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { IntegrationOAuth } from "../integrations/oauth/flow"
import { upstreamToolsKey, upstreamUserToolsKey } from "../mcp/cache-keys"
import { AppConfig } from "../platform/config"
import { Ids } from "../platform/ids"
import { KvCache } from "../platform/kv"
import { ResourceVisibility } from "../resources/resource-visibility"
import { ResourcesRepo } from "../resources/resources-repo"
import { AccountModes } from "./account-mode"
import { ConnectionsRepo } from "./connections-repo"
import { connectMethodOf } from "./method"
import { myConnections } from "./my-connections"
import { ConnectionOAuth, connectionCallbackPath } from "./oauth/start"
import { ConnectionVault } from "./vault"

type Failure = Forbidden | NotFound | InvalidInput

const JsonObjectText = Schema.fromJsonString(Schema.JsonObject)

/**
 * Who may connect what. Shared accounts: only `resources:manage`. Per-user accounts: each member with a grant
 * on the resource, for themselves only; nobody reads or removes another member's (offboarding aside).
 */
export class Connections extends Context.Service<Connections, {
  readonly oauthSettings: (principal: Principal) => Effect.Effect<OAuthSettings, Forbidden>
  readonly forResource: (principal: Principal, id: ResourceId) => Effect.Effect<ResourceConnections, Forbidden | NotFound>
  readonly mine: (principal: Principal) => Effect.Effect<ReadonlyArray<MyConnection>, Forbidden>
  readonly setMode: (principal: Principal, id: ResourceId, input: SetAccountMode) => Effect.Effect<Resource, Failure>
  readonly startOAuth: (principal: Principal, id: ResourceId) => Effect.Effect<OAuthStart, Failure | UpstreamFailure | AuthorizationServerChanged>
  readonly connectSecret: (principal: Principal, id: ResourceId, input: ConnectSecret) => Effect.Effect<Connection, Failure>
  readonly disconnect: (principal: Principal, id: ResourceId) => Effect.Effect<ResourceConnections, Failure>
}>()("api/connections/Connections") {
  static readonly layer = Layer.effect(
    Connections,
    Effect.gen(function*() {
      const resources = yield* ResourcesRepo
      const repo = yield* ConnectionsRepo
      const vault = yield* ConnectionVault
      const oauth = yield* ConnectionOAuth
      const integrationOAuth = yield* IntegrationOAuth
      const policy = yield* AccessPolicy
      const audit = yield* AuditLog
      const cache = yield* KvCache
      const modes = yield* AccountModes
      const visibility = yield* ResourceVisibility
      const redirectUri = `${(yield* AppConfig).API_URL}${connectionCallbackPath}`

      /**
       * A resource the caller cannot see is NotFound, as on `GET /resources/:id`. The stored resource is
       * returned (not the caller's presentation of it): connection methods depend on its full config.
       */
      const load = (principal: Principal, id: ResourceId) =>
        Effect.andThen(
          visibility.find(principal, id),
          resources.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "resource", id })))
        )

      /** Per-user accounts are for members who may use the resource. */
      const requireGrant = (principal: Principal, resource: Resource) =>
        Effect.flatMap(policy.resolve(principal), (access) =>
          access.has(resource.id) ? Effect.void : Effect.fail(new Forbidden({ message: "you have no grant on this resource" })))

      const audited = (principal: Principal, connection: Connection, reason: string) =>
        audit.by(principal, "connection.disconnected", { type: "resource", id: connection.resourceId }, {
          connectionId: connection.id,
          mode: connection.mode,
          userId: connection.userId,
          reason
        })

      const forResource = Effect.fn("Connections.forResource")(function*(principal: Principal, id: ResourceId) {
        yield* requirePermission(principal, "resources:read")
        const resource = yield* load(principal, id)
        const mode = accountModeOf(resource.config)
        const row = (owner: Principal & { _tag: "User" } | null) =>
          Effect.map(repo.find(principal.orgId, id, owner === null ? null : owner.userId), Option.match({ onNone: () => null, onSome: (found) => found.connection }))
        const state: ResourceConnections = {
          resourceId: id,
          mode,
          method: connectMethodOf(resource.config),
          shared: mode === "shared" ? yield* row(null) : null,
          mine: mode === "per_user" && principal._tag === "User" ? yield* row(principal) : null,
          canManage: hasPermission(principal, "resources:manage")
        }
        return state
      })

      const setMode = Effect.fn("Connections.setMode")(function*(principal: Principal, id: ResourceId, input: SetAccountMode) {
        yield* requirePermission(principal, "resources:manage")
        const resource = yield* load(principal, id)
        const previous = accountModeOf(resource.config)
        if (previous === input.mode) return resource
        return yield* modes.switch(principal, resource, input.mode)
      })

      /** A refused authorization server is a security event: the admin's client was about to go elsewhere. */
      const refusedServer = (principal: Principal, mode: AccountMode) => (error: AuthorizationServerChanged) =>
        audit.by(principal, "connection.refreshed_failed", { type: "resource", id: error.resourceId }, {
          reason: "authorization_server_changed",
          field: error.field,
          mode
        })

      const startOAuth = Effect.fn("Connections.startOAuth")(function*(principal: Principal, id: ResourceId) {
        const user = yield* requireUser(principal)
        const resource = yield* load(principal, id)
        if (accountModeOf(resource.config) === "per_user") {
          yield* requireGrant(principal, resource)
          return yield* oauth.start(resource, user.userId, user.userId).pipe(Effect.tapErrorTag("AuthorizationServerChanged", refusedServer(principal, "per_user")))
        }
        yield* requirePermission(principal, "resources:manage")
        // Shared integrations keep their established flow and managed token secret.
        if (resource.config.kind === "integration") return yield* integrationOAuth.start(principal, id)
        return yield* oauth.start(resource, user.userId, null).pipe(Effect.tapErrorTag("AuthorizationServerChanged", refusedServer(principal, "shared")))
      })

      const connectSecret = Effect.fn("Connections.connectSecret")(function*(principal: Principal, id: ResourceId, input: ConnectSecret) {
        const user = yield* requireUser(principal)
        const resource = yield* load(principal, id)
        if (connectMethodOf(resource.config) !== "secret") return yield* new InvalidInput({ message: `${resource.name} does not take a personal token`, field: "value" })
        yield* requireGrant(principal, resource)
        const { config } = resource
        const value = Redacted.value(input.value)
        const needsJson = config.kind === "integration" && (config.connection.type === "basic" || config.connection.type === "custom")
        if (needsJson && Option.isNone(Schema.decodeUnknownOption(JsonObjectText)(value))) {
          return yield* new InvalidInput({ message: "this connection takes a JSON object of its fields", field: "value" })
        }
        const connection: Connection = {
          id: yield* Ids.connection,
          orgId: principal.orgId,
          resourceId: id,
          mode: "per_user",
          userId: user.userId,
          method: "secret",
          status: "connected",
          accountIdentity: null,
          connectedBy: { userId: user.userId, email: user.email },
          connectedAt: yield* DateTime.now,
          refreshedAt: null
        }
        yield* repo.put(connection, yield* vault.seal({ type: "secret", value }))
        yield* cache.remove(upstreamUserToolsKey(id, user.userId))
        yield* audit.by(principal, "connection.connected", { type: "resource", id }, { connectionId: connection.id, mode: "per_user", method: "secret" })
        return connection
      })

      const disconnect = Effect.fn("Connections.disconnect")(function*(principal: Principal, id: ResourceId) {
        const user = yield* requireUser(principal)
        const resource = yield* load(principal, id)
        const perUser = accountModeOf(resource.config) === "per_user"
        if (!perUser) yield* requirePermission(principal, "resources:manage")
        if (!perUser && resource.config.kind === "integration" && resource.config.connection.type === "oauth2") yield* integrationOAuth.disconnect(principal, id)
        const removed = yield* repo.remove(principal.orgId, id, perUser ? user.userId : null)
        if (Option.isSome(removed)) yield* audited(principal, removed.value, "disconnected")
        yield* cache.remove(perUser ? upstreamUserToolsKey(id, user.userId) : upstreamToolsKey(id))
        return yield* forResource(principal, id)
      })

      return Connections.of({
        oauthSettings: (principal) => Effect.as(requirePermission(principal, "resources:read"), { redirectUri }),
        forResource,
        mine: Effect.fn("Connections.mine")(function*(principal: Principal) {
          const user = yield* requireUser(principal)
          const access = yield* policy.resolve(principal)
          return myConnections(access, yield* repo.ofUser(principal.orgId, user.userId))
        }),
        setMode,
        startOAuth,
        connectSecret,
        disconnect
      })
    })
  )
}

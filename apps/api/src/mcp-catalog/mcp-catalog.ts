import {
  type AuthorizationServerChanged,
  type CatalogServerConnected,
  type Conflict,
  type ConnectCatalogServer,
  findCatalogEntry,
  type Forbidden,
  InvalidInput,
  type McpCatalogEntry,
  type McpCatalogItem,
  mcpCatalog,
  type McpServerConfig,
  NotFound,
  type Principal,
  type Resource,
  type UpstreamFailure
} from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { requirePermission, requireUser } from "../auth/permissions"
import { ConnectionsRepo } from "../connections/connections-repo"
import { ConnectionOAuth } from "../connections/oauth/start"
import { ResourceVisibility } from "../resources/resource-visibility"
import { Resources } from "../resources/resources"
import { ResourcesRepo } from "../resources/resources-repo"
import { addedServer, serversFor, unusedName } from "./added"

type ConnectFailure = Forbidden | NotFound | Conflict | InvalidInput | UpstreamFailure | AuthorizationServerChanged

/**
 * One-click official MCP servers. Connecting is the ordinary path, composed: `Resources.create` (checked and
 * audited `resource.created`), then `ConnectionOAuth.start` (the MCP OAuth flow with discovery, dynamic client
 * registration and PKCE; `connection.connected` is audited by its callback). Nothing here bypasses either.
 */
export class McpCatalog extends Context.Service<McpCatalog, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<McpCatalogItem>, Forbidden>
  readonly connect: (principal: Principal, slug: string, input: ConnectCatalogServer) => Effect.Effect<CatalogServerConnected, ConnectFailure>
}>()("api/mcp-catalog/McpCatalog") {
  static readonly layer = Layer.effect(
    McpCatalog,
    Effect.gen(function*() {
      const resources = yield* Resources
      const repo = yield* ResourcesRepo
      const connections = yield* ConnectionsRepo
      const visibility = yield* ResourceVisibility
      const oauth = yield* ConnectionOAuth

      const sharedOf = (server: Resource) =>
        Effect.map(connections.find(server.orgId, server.id, null), Option.match({ onNone: () => null, onSome: (found) => found.connection }))

      const list = Effect.fn("McpCatalog.list")(function*(principal: Principal) {
        yield* requirePermission(principal, "resources:read")
        // Only servers the caller may see count as added, so names of hidden ones never leak.
        const servers = yield* visibility.filter(principal, yield* repo.ofKind(principal.orgId, "mcp_server"))
        return yield* Effect.forEach(mcpCatalog, (entry) =>
          Effect.map(Effect.forEach(serversFor(entry, servers), (server) => Effect.map(sharedOf(server), (shared) => addedServer(server, shared))), (added): McpCatalogItem => ({ entry, added })))
      })

      const create = (principal: Principal, name: string, description: string, config: McpServerConfig) =>
        resources.create(principal, { name, description, projectId: null, config })

      /** A shared token server: the token becomes an encrypted secret first; if the server is refused, it goes again. */
      const createWithToken = (principal: Principal, entry: McpCatalogEntry, name: string, input: ConnectCatalogServer) =>
        Effect.gen(function*() {
          if (input.token === undefined) return yield* new InvalidInput({ message: `${entry.name} connects with a token: paste one, or let each member connect their own`, field: "token" })
          const secretNames = (yield* repo.ofKind(principal.orgId, "secret")).map((secret) => secret.name)
          const secret = yield* resources.create(principal, { name: unusedName(`${name} token`, secretNames), description: `Access token for ${name}.`, projectId: null, config: { kind: "secret", value: input.token } })
          return yield* create(principal, name, entry.description, { kind: "mcp_server", url: entry.url, transport: entry.transport, auth: { type: "secret", secretId: secret.id } }).pipe(
            Effect.tapError(() => Effect.ignore(resources.remove(principal, secret.id)))
          )
        })

      const connect = Effect.fn("McpCatalog.connect")(function*(principal: Principal, slug: string, input: ConnectCatalogServer) {
        yield* requirePermission(principal, "resources:manage")
        const user = yield* requireUser(principal)
        const entry = findCatalogEntry(slug)
        if (entry === undefined) return yield* new NotFound({ entity: "mcp_catalog_entry", id: slug })
        yield* Effect.annotateCurrentSpan({ "mcp_catalog.slug": slug, "connection.mode": input.accountMode })
        const taken = (yield* repo.ofKind(principal.orgId, "mcp_server")).map((server) => server.name)
        const name = input.name ?? unusedName(entry.name, taken)
        const perUser = input.accountMode === "per_user"
        const done = (resource: Resource): CatalogServerConnected => ({ resource, authorizeUrl: null, expiresAt: null })
        switch (entry.auth) {
          case "oauth-client":
            return yield* new InvalidInput({ message: `${entry.name} needs an OAuth client registered with ${entry.vendor}; add it under Resources with its client ID`, field: "slug" })
          case "token":
            return done(perUser
              ? yield* create(principal, name, entry.description, { kind: "mcp_server", url: entry.url, transport: entry.transport, accountMode: "per_user", auth: { type: "secret" } })
              : yield* createWithToken(principal, entry, name, input))
          case "oauth-dcr": {
            const config: McpServerConfig = { kind: "mcp_server", url: entry.url, transport: entry.transport, ...(perUser ? { accountMode: "per_user" as const } : {}), auth: { type: "oauth" } }
            const resource = yield* create(principal, name, entry.description, config)
            if (perUser) return done(resource)
            // One step for the admin: a server whose sign-in cannot even start is not left behind half-made.
            const started = yield* oauth.start(resource, user.userId, null, input.returnTo).pipe(Effect.tapError(() => Effect.ignore(resources.remove(principal, resource.id))))
            const connected: CatalogServerConnected = { resource, authorizeUrl: started.authorizeUrl, expiresAt: started.expiresAt }
            return connected
          }
        }
      })

      return McpCatalog.of({ list, connect })
    })
  )
}

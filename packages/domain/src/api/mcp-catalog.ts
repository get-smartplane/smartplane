import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { AccountMode } from "../connections/account"
import { AuthorizationServerChanged } from "../connections/errors"
import { Conflict, Forbidden, InvalidInput, NotFound, UpstreamFailure } from "../errors"
import { ResourceId } from "../ids"
import { McpCatalogEntry } from "../mcp-catalog/entry"
import { HttpUrl, Name, Slug, Timestamp } from "../primitives"
import { Resource } from "../resources/resource"
import { SecretValue } from "../resources/secret"
import { OAuthReturnTo } from "./integrations"
import { Authentication } from "./security"

/**
 * Where an added server stands: its shared account is `connected`, `needs_reauth` (the provider refused a
 * refresh) or `not_connected` (nobody signed in yet, or the sign-in failed); `per_user` servers are
 * connected by each member, so there is nothing for the org to finish.
 */
export const CatalogServerStatus = Schema.Literals(["connected", "needs_reauth", "not_connected", "per_user"]).annotate({ identifier: "CatalogServerStatus" })
export type CatalogServerStatus = typeof CatalogServerStatus.Type

/** An org resource that points at a catalog server's URL. */
export const AddedCatalogServer = Schema.Struct({
  resourceId: ResourceId,
  name: Name,
  accountMode: AccountMode,
  status: CatalogServerStatus,
  /** Who connected the shared account (email), when one is connected. */
  connectedBy: Schema.NullOr(Schema.String),
  connectedAt: Schema.NullOr(Timestamp)
}).annotate({ identifier: "AddedCatalogServer" })
export type AddedCatalogServer = typeof AddedCatalogServer.Type

export const McpCatalogItem = Schema.Struct({
  entry: McpCatalogEntry,
  /** The caller's org's resources for this server; empty when it has not been added. */
  added: Schema.Array(AddedCatalogServer)
}).annotate({ identifier: "McpCatalogItem" })
export type McpCatalogItem = typeof McpCatalogItem.Type

export const ConnectCatalogServer = Schema.Struct({
  accountMode: AccountMode,
  /** Defaults to the entry's name. */
  name: Schema.optionalKey(Name),
  /** Where the browser lands after the provider's sign-in; default the server's own page. */
  returnTo: Schema.optionalKey(OAuthReturnTo),
  /**
   * `token` servers in `shared` mode only: the account's token, stored as an encrypted `secret` resource.
   * Per-user token servers take each member's own token on My connections instead.
   */
  token: Schema.optionalKey(SecretValue)
}).annotate({ identifier: "ConnectCatalogServer" })
export type ConnectCatalogServer = typeof ConnectCatalogServer.Type

export const CatalogServerConnected = Schema.Struct({
  resource: Resource,
  /** Send the browser here to sign in; null when nothing is left to sign in to (per-user, or a token). */
  authorizeUrl: Schema.NullOr(HttpUrl),
  expiresAt: Schema.NullOr(Timestamp)
}).annotate({ identifier: "CatalogServerConnected" })
export type CatalogServerConnected = typeof CatalogServerConnected.Type

/**
 * Official remote MCP servers an admin connects in one step. `connect` creates the `mcp_server` resource (an
 * ordinary one: grants, guards and audit apply as to any other) and starts its OAuth sign-in; after the
 * provider's consent screen the browser lands as `ConnectionsApi` describes, or on `returnTo`'s page:
 * `<APP_URL>/setup?step=tool&resource=<id>&connection=…` or `<APP_URL>/integrations?resource=<id>&connection=…`.
 */
export class McpCatalogApi extends HttpApiGroup.make("mcpCatalog")
  .add(
    /** Needs `resources:read`. */
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(McpCatalogItem), error: Forbidden }),
    /**
     * Needs `resources:manage`. Without `name`, the entry's name is used (with a number when the org already
     * has a server of that name); a `name` already in use is a Conflict.
     */
    HttpApiEndpoint.post("connect", "/:slug/connect", {
      params: { slug: Slug },
      payload: ConnectCatalogServer,
      success: CatalogServerConnected.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound, Conflict, InvalidInput, UpstreamFailure, AuthorizationServerChanged]
    })
  )
  .middleware(Authentication)
  .prefix("/mcp-catalog")
{}

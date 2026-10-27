import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Connection, ConnectSecret, MyConnection, ResourceConnections, SetAccountMode } from "../connections/connection"
import { AuthorizationServerChanged } from "../connections/errors"
import { Forbidden, InvalidInput, NotFound, UpstreamFailure } from "../errors"
import { ResourceId } from "../ids"
import { Resource } from "../resources/resource"
import { OAuthSettings, OAuthStart } from "./integrations"
import { Authentication } from "./security"

const params = { id: ResourceId }

/**
 * Accounts connected to credentialed resources (MCP servers, APIs, integrations). A `shared` resource has one
 * account that only `resources:manage` may connect, reconnect or disconnect; a `per_user` resource has one per
 * member, which only that member can connect or disconnect and nobody can read. Credentials never appear
 * here. After an OAuth sign-in the browser lands on `<APP_URL>/resources/<id>?connection=connected` (shared)
 * or `<APP_URL>/connections?connection=connected` (per-user), or `?connection=error&reason=<code>`
 * (`ConnectionCallbackFailure`).
 */
export class ConnectionsApi extends HttpApiGroup.make("connections")
  .add(
    /** The redirect URI to register when an admin supplies their own OAuth client for an MCP server. */
    HttpApiEndpoint.get("oauthSettings", "/oauth/settings", { success: OAuthSettings, error: Forbidden }),
    /** The caller's per-user resources and their own connection to each. */
    HttpApiEndpoint.get("mine", "/mine", { success: Schema.Array(MyConnection), error: Forbidden }),
    HttpApiEndpoint.get("forResource", "/resources/:id", { params, success: ResourceConnections, error: [Forbidden, NotFound] }),
    /** Switches between one shared account and per-user accounts; connections of the old mode are deleted. */
    HttpApiEndpoint.put("setMode", "/resources/:id/mode", { params, payload: SetAccountMode, success: Resource, error: [Forbidden, NotFound, InvalidInput] }),
    /** Starts an OAuth sign-in: the shared account (`resources:manage`) or, in `per_user` mode, the caller's own. */
    HttpApiEndpoint.post("startOAuth", "/resources/:id/oauth/start", { params, success: OAuthStart, error: [Forbidden, NotFound, InvalidInput, UpstreamFailure, AuthorizationServerChanged] }),
    /** Connects the caller's own token or API key to a `per_user` resource that connects with a secret. */
    HttpApiEndpoint.post("connectSecret", "/resources/:id/secret", { params, payload: ConnectSecret, success: Connection, error: [Forbidden, NotFound, InvalidInput] }),
    /** Deletes the shared account's connection (`resources:manage`) or, in `per_user` mode, the caller's own. */
    HttpApiEndpoint.post("disconnect", "/resources/:id/disconnect", { params, success: ResourceConnections, error: [Forbidden, NotFound, InvalidInput] })
  )
  .middleware(Authentication)
  .prefix("/connections")
{}

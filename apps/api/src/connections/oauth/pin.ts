import { AuthorizationServerChanged, type McpOAuth, type Resource } from "@pc/domain"
import { Effect, Option } from "effect"
import type { McpAuthServer } from "./discovery"
import { sameIssuer } from "./endpoint-screen"

/**
 * An admin-supplied client (and its secret) belongs to one authorization server. Once that server is pinned,
 * discovery naming another issuer or token endpoint is refused before the client is presented anywhere: the
 * MCP server's metadata decides where to authorize, and a compromised server must not redirect the secret.
 * Dynamically registered clients carry no admin secret and are not pinned.
 */
export const requirePinnedAuthServer = (resource: Resource, auth: McpOAuth, server: McpAuthServer): Effect.Effect<void, AuthorizationServerChanged> => {
  if (auth.clientId === undefined) return Effect.void
  const changed = (field: "issuer" | "token_endpoint", pinned: string, found: string) =>
    Effect.fail(new AuthorizationServerChanged({ resourceId: resource.id, field, message: `${resource.name}'s OAuth ${field} is now ${found}, not the pinned ${pinned}` }))
  if (auth.issuer !== undefined && !sameIssuer(server.metadata.issuer, auth.issuer)) return changed("issuer", auth.issuer, server.metadata.issuer)
  if (auth.tokenEndpoint !== undefined && server.metadata.token_endpoint !== auth.tokenEndpoint) {
    return changed("token_endpoint", auth.tokenEndpoint, server.metadata.token_endpoint)
  }
  return Effect.void
}

/**
 * The resource with its admin-supplied client's authorization server pinned, after the first sign-in that
 * succeeded with it; none when there is nothing to pin (a registered client, or pins already set).
 */
export const withPinnedAuthServer = (resource: Resource, issuer: string | undefined, tokenEndpoint: string): Option.Option<Resource> => {
  const { config } = resource
  if (config.kind !== "mcp_server" || config.auth?.type !== "oauth" || config.auth.clientId === undefined || issuer === undefined) return Option.none()
  if (config.auth.issuer !== undefined && config.auth.tokenEndpoint !== undefined) return Option.none()
  const auth = { ...config.auth, issuer: config.auth.issuer ?? issuer, tokenEndpoint: config.auth.tokenEndpoint ?? tokenEndpoint }
  return Option.some({ ...resource, config: { ...config, auth } })
}

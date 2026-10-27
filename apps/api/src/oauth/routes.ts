import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { AppConfig } from "../platform/config"
import { oauthSettings, type OAuthSettings } from "./settings"

/** AuthKit's supported scopes; MCP clients ask for these when they start the authorization flow. */
const Scopes = ["openid", "profile", "email", "offline_access"]

/** RFC 9728 protected resource metadata: tells MCP clients which authorization server issues our tokens. */
export const protectedResourceMetadata = (settings: OAuthSettings) => ({
  resource: settings.resource,
  authorization_servers: [settings.issuer],
  bearer_methods_supported: ["header"],
  scopes_supported: Scopes,
  resource_name: "Smartplane"
})

const metadata = Effect.gen(function*() {
  const settings = oauthSettings(yield* AppConfig)
  if (settings === undefined) return HttpServerResponse.jsonUnsafe({ error: "mcp_oauth_disabled" }, { status: 404 })
  return HttpServerResponse.jsonUnsafe(protectedResourceMetadata(settings), {
    headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" }
  })
}).pipe(Effect.withSpan("oauth.protected_resource_metadata"))

/** Served at the path-inserted location for `/mcp` and at the root, which older clients probe. */
export const OAuthMetadataRoutes = Layer.mergeAll(
  HttpRouter.add("GET", "/.well-known/oauth-protected-resource/mcp", metadata),
  HttpRouter.add("GET", "/.well-known/oauth-protected-resource", metadata)
)

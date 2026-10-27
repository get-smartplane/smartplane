import type { EnvConfig } from "../platform/config"

/** MCP OAuth as a protected resource (RFC 9728) whose authorization server is WorkOS AuthKit. */
export interface OAuthSettings {
  /** AuthKit's issuer, `https://<authkit domain>`; also the authorization server we advertise. */
  readonly issuer: string
  readonly jwksUrl: string
  /** The canonical URI of our MCP endpoint, which clients send as the `resource` indicator. */
  readonly resource: string
  readonly audience: string
  /** Where the protected resource metadata for `resource` lives (path-inserted per RFC 9728 §3.1). */
  readonly metadataUrl: string
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, "")

/** `undefined` when MCP OAuth is not configured. */
export const oauthSettings = (config: EnvConfig): OAuthSettings | undefined => {
  const domain = config.WORKOS_AUTHKIT_DOMAIN?.trim() ?? ""
  if (domain === "") return undefined
  const issuer = withoutTrailingSlash(/^https?:\/\//.test(domain) ? domain : `https://${domain}`)
  const resource = `${withoutTrailingSlash(config.API_URL)}/mcp`
  const { origin, pathname } = new URL(resource)
  const audience = config.MCP_OAUTH_AUDIENCE?.trim() ?? ""
  return {
    issuer,
    jwksUrl: `${issuer}/oauth2/jwks`,
    resource,
    audience: audience === "" ? resource : audience,
    metadataUrl: `${origin}/.well-known/oauth-protected-resource${pathname}`
  }
}

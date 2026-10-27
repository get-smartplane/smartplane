import { Result } from "effect"
import { screenUrl } from "../../skills/fetch/safe-url"

const loopbackHosts: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"])

const parse = (raw: string): URL | undefined => {
  try {
    return new URL(raw)
  } catch {
    return undefined
  }
}

/** `http://localhost` (and loopback literals) while developing against a local authorization server. */
export const isLocalDevelopmentUrl = (raw: string, environment: string): boolean => {
  const url = parse(raw)
  return environment === "development" && url !== undefined && url.protocol === "http:" && loopbackHosts.has(url.hostname)
}

/**
 * Screens an OAuth endpoint named by metadata the MCP server (or its authorization server) controls. Codes,
 * PKCE verifiers, client secrets and access tokens are sent there, so it must be HTTPS to a public host on
 * the default port: the same SSRF screen as skill fetches. Plain http is allowed only for loopback hosts
 * when `ENVIRONMENT` is `development`.
 */
export const screenOAuthEndpoint = (raw: string, environment: string): Result.Result<URL, string> => {
  const local = isLocalDevelopmentUrl(raw, environment) ? parse(raw) : undefined
  if (local !== undefined) return Result.succeed(local)
  return Result.mapError(screenUrl(raw), (refused) => refused.message)
}

const withoutTrailingSlash = (value: string) => (value.endsWith("/") ? value.slice(0, -1) : value)

/**
 * RFC 8414 §3.3: the metadata's `issuer` must be the authorization server URL it was fetched for. A single
 * trailing slash is tolerated, since the URL derived from a server origin always carries one.
 */
export const sameIssuer = (issuer: string, authorizationServerUrl: string): boolean =>
  withoutTrailingSlash(issuer) === withoutTrailingSlash(authorizationServerUrl)

/** Both URLs name the same host (and port), so a credential for one is not handed to another. */
export const sameHost = (a: string, b: string): boolean => {
  const left = parse(a)
  const right = parse(b)
  return left !== undefined && right !== undefined && left.host === right.host
}

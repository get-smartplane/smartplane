/** What the fake servers saw: method, URL and the request body as form fields or JSON text. */
export interface SeenRequest {
  readonly method: string
  readonly url: string
  readonly authorization: string | null
  readonly form: Readonly<Record<string, string>>
  readonly body: string
}

export interface FakeOAuthOptions {
  /** Advertise a registration endpoint (RFC 7591). */
  readonly dcr?: boolean
  /** The account the issued `id_token` names. */
  readonly email?: string
  /** Refuse refresh grants with `invalid_grant`. */
  readonly refuseRefresh?: boolean
  /** The authorization server the MCP server names (and that answers); read per request, so tests may switch it. */
  issuer?: string
  /** Fields merged over the authorization server's metadata. */
  metadata?: Readonly<Record<string, unknown>>
  /** Issue an `id_token` with authorization-code grants (default true). */
  readonly idToken?: boolean
}

export const mcpUrl = "https://mcp.example.com/mcp"
export const issuer = "https://auth.example.com"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const base64Url = (value: string) => btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unsignedJwt = (claims: Record<string, unknown>) => `${base64Url(JSON.stringify({ alg: "none" }))}.${base64Url(JSON.stringify(claims))}.`

/**
 * An MCP server's protected-resource metadata plus its authorization server (RFC 9728, RFC 8414, RFC 7591,
 * token endpoint), as a `fetch` for tests. Access tokens count up: `at-1`, `at-2`, ...
 */
export const fakeOAuthServer = (options: FakeOAuthOptions = {}) => {
  const seen: Array<SeenRequest> = []
  let issued = 0
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const body = request.method === "GET" ? "" : await request.text()
    const form = request.headers.get("content-type")?.includes("form") ? Object.fromEntries(new URLSearchParams(body)) : {}
    seen.push({ method: request.method, url: url.href, authorization: request.headers.get("authorization"), form, body })
    const as = options.issuer ?? issuer
    if (url.pathname === "/userinfo") return json({ sub: "acct-ui", email: "userinfo@acme.com" })
    switch (url.origin + url.pathname) {
      case "https://mcp.example.com/.well-known/oauth-protected-resource/mcp":
        return json({ resource: mcpUrl, authorization_servers: [as], scopes_supported: ["files:read", "files:write"] })
      case `${as}/.well-known/oauth-authorization-server`:
        return json({
          issuer: as,
          authorization_endpoint: `${as}/authorize`,
          token_endpoint: `${as}/token`,
          ...(options.dcr === false ? {} : { registration_endpoint: `${as}/register` }),
          userinfo_endpoint: `${as}/userinfo`,
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
          ...options.metadata
        })
      case `${as}/register`:
        return json({ ...JSON.parse(body), client_id: "dcr-client-1", client_secret: "dcr-secret-1", token_endpoint_auth_method: "client_secret_basic" }, 201)
      case `${as}/token`: {
        if (form.grant_type === "refresh_token" && options.refuseRefresh) return json({ error: "invalid_grant" }, 400)
        issued++
        const refresh = form.grant_type === "authorization_code" ? { refresh_token: "rt-secret-1" } : {}
        const idToken = form.grant_type === "authorization_code" && options.idToken !== false ? { id_token: unsignedJwt({ sub: "acct-42", email: options.email ?? "billing@acme.com" }) } : {}
        return json({ access_token: `at-${issued}`, token_type: "Bearer", expires_in: 3600, scope: "files:read", ...refresh, ...idToken })
      }
      default:
        return new Response("not found", { status: 404 })
    }
  }
  return { fetch, seen }
}

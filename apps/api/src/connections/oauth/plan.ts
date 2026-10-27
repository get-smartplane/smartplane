import { startAuthorization } from "@modelcontextprotocol/client"
import { accountModeOf, InvalidInput, type McpOAuth, type Resource, UpstreamFailure } from "@pc/domain"
import { Effect } from "effect"
import { IntegrationCatalog } from "../../integrations/catalog"
import { oauthAppOf } from "../../integrations/oauth/app"
import { authorizeUrl } from "../../integrations/oauth/authorize-url"
import { codeChallenge, codeVerifier } from "../../integrations/oauth/pkce"
import type { ConnectionClient, OAuthGrantTarget } from "../credential"
import { McpOAuthDiscovery } from "./discovery"
import { requirePinnedAuthServer } from "./pin"
import { clientAuthenticationOf, McpClientRegistration, preferredAuthentication } from "./registration"

/** An authorization ready to send the browser to, and what the callback needs to finish it. */
export interface AuthorizationPlan extends OAuthGrantTarget {
  readonly authorizeUrl: string
  readonly codeVerifier: string | null
  readonly userinfoUrl?: string
  /** The MCP authorization server's issuer, pinned for an admin-supplied client once a sign-in succeeds. */
  readonly issuer?: string
}

/**
 * What must not change between starting and finishing a sign-in: the mode, and where and as which client the
 * tokens are requested. The callback refuses a flow whose resource no longer matches.
 */
export const authFingerprint = (resource: Resource): string => {
  const { config } = resource
  const mode = accountModeOf(config)
  if (config.kind === "mcp_server") return JSON.stringify([mode, config.url, config.auth ?? null])
  if (config.kind === "integration" && config.connection.type === "oauth2") {
    return JSON.stringify([mode, config.pieceId, config.connection.clientId, config.connection.clientSecretId, config.connection.props ?? {}])
  }
  return JSON.stringify([mode, config.kind])
}

const failed = (resource: Resource) => (cause: unknown) =>
  new UpstreamFailure({ upstream: resource.name, message: cause instanceof Error ? cause.message : String(cause) })

/**
 * MCP authorization: discover the server's authorization server, use the admin's client or register one
 * (RFC 7591), and build the authorize URL with PKCE (S256) and the `resource` indicator (RFC 8707).
 */
export const mcpPlan = (resource: Resource, auth: McpOAuth, serverUrl: string, redirectUri: string, state: string) =>
  Effect.gen(function*() {
    const server = yield* McpOAuthDiscovery.use((discovery) => discovery.discover(serverUrl))
    yield* requirePinnedAuthServer(resource, auth, server)
    const client: ConnectionClient = auth.clientId === undefined
      ? yield* McpClientRegistration.use((registration) => registration.register(server, redirectUri))
      : auth.clientSecretId === undefined
      ? { clientId: auth.clientId, authentication: "none" }
      : { clientId: auth.clientId, authentication: clientAuthenticationOf(preferredAuthentication(server.metadata)), clientSecretId: auth.clientSecretId }
    const scope = (auth.scopes ?? server.scopes).join(" ")
    const started = yield* Effect.tryPromise({
      try: () =>
        startAuthorization(server.authorizationServerUrl, {
          metadata: server.sdkMetadata,
          clientInformation: { client_id: client.clientId },
          redirectUrl: redirectUri,
          state,
          resource: server.resource,
          ...(scope === "" ? {} : { scope })
        }),
      catch: failed(resource)
    })
    const plan: AuthorizationPlan = {
      authorizeUrl: started.authorizationUrl.href,
      codeVerifier: started.codeVerifier,
      client,
      tokenUrl: server.metadata.token_endpoint,
      resource: server.resource,
      issuer: server.metadata.issuer,
      ...(server.userinfoUrl === undefined ? {} : { userinfoUrl: server.userinfoUrl })
    }
    return plan
  })

/** A member's own sign-in to a per-user integration, through the org's OAuth app and the piece's endpoints. */
export const integrationPlan = (resource: Resource, redirectUri: string, state: string): Effect.Effect<AuthorizationPlan, InvalidInput, IntegrationCatalog> =>
  Effect.gen(function*() {
    const app = yield* oauthAppOf(resource)
    const verifier = app.auth.pkce === null ? null : yield* codeVerifier
    const challenge = verifier === null || app.auth.pkce === null ? null : yield* codeChallenge(verifier, app.auth.pkce)
    return {
      authorizeUrl: authorizeUrl({ auth: app.auth, connection: app.connection, authUrl: app.authUrl, scopes: app.scopes, redirectUri, state, codeChallenge: challenge }),
      codeVerifier: verifier,
      client: { clientId: app.connection.clientId, authentication: app.auth.clientAuthentication, clientSecretId: app.connection.clientSecretId },
      tokenUrl: app.tokenUrl,
      ...(app.refreshUrl === app.tokenUrl ? {} : { refreshUrl: app.refreshUrl })
    } satisfies AuthorizationPlan
  })

export const notOAuth = (resource: Resource) => new InvalidInput({ message: `${resource.name} does not connect with OAuth`, field: "config" })

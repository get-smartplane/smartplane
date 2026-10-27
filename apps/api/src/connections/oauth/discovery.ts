import { type AuthorizationServerMetadata, checkResourceAllowed, discoverOAuthServerInfo, resourceUrlFromServerUrl } from "@modelcontextprotocol/client"
import { UpstreamFailure } from "@pc/domain"
import { Context, Effect, Layer, Option, Result, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { AppConfig } from "../../platform/config"
import { screenOAuthEndpoint } from "./endpoint-screen"
import { checkAuthServerMetadata } from "./metadata-check"

/** RFC 8414 / OpenID Connect Discovery fields Smartplane uses, decoded from what the SDK fetched. */
export const AuthServerMetadata = Schema.Struct({
  issuer: Schema.String,
  authorization_endpoint: Schema.String,
  token_endpoint: Schema.String,
  registration_endpoint: Schema.optional(Schema.String),
  userinfo_endpoint: Schema.optional(Schema.String),
  scopes_supported: Schema.optional(Schema.Array(Schema.String)),
  code_challenge_methods_supported: Schema.optional(Schema.Array(Schema.String)),
  token_endpoint_auth_methods_supported: Schema.optional(Schema.Array(Schema.String))
})
export type AuthServerMetadata = typeof AuthServerMetadata.Type

/** RFC 9728 protected-resource metadata. */
const ResourceMetadata = Schema.Struct({
  resource: Schema.String,
  authorization_servers: Schema.optional(Schema.Array(Schema.String)),
  scopes_supported: Schema.optional(Schema.Array(Schema.String))
})

/** Where and how to authorize against one MCP server. */
export interface McpAuthServer {
  /** The RFC 8707 resource indicator: the protected-resource metadata's `resource`, else the server URL. */
  readonly resource: string
  readonly authorizationServerUrl: string
  readonly metadata: AuthServerMetadata
  /** The SDK's own view of the same metadata, handed back to SDK calls in the same request. */
  readonly sdkMetadata: AuthorizationServerMetadata
  /** The resource's advertised scopes, else the authorization server's. */
  readonly scopes: ReadonlyArray<string>
  /** The userinfo endpoint, only when it is on the issuer's own host (see `checkAuthServerMetadata`). */
  readonly userinfoUrl: string | undefined
}

const unavailable = (url: string, message: string) => new UpstreamFailure({ upstream: url, message })

const urlOf = (input: string | URL | Request): string => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url)

/**
 * The MCP server's own origin is the admin's choice; any other host (its authorization server, which the
 * MCP server names) passes the endpoint screen before it is fetched.
 */
const screenedFetch = (fetchFn: typeof globalThis.fetch, serverUrl: string, environment: string): typeof globalThis.fetch => (input, init) => {
  const url = urlOf(input)
  if (sameOrigin(url, serverUrl)) return fetchFn(input, init)
  const screened = screenOAuthEndpoint(url, environment)
  return Result.isSuccess(screened) ? fetchFn(input, init) : Promise.reject(new Error(`refused to fetch ${url}: ${screened.failure}`))
}

const sameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/**
 * MCP authorization discovery (spec 2025-06-18+): the server's protected-resource metadata names its
 * authorization server, whose RFC 8414 / OIDC metadata gives the endpoints. Fetching goes through the SDK
 * with Effect's `Fetch`, so tests substitute HTTP; every document is decoded here before use.
 */
export class McpOAuthDiscovery extends Context.Service<McpOAuthDiscovery, {
  readonly discover: (serverUrl: string) => Effect.Effect<McpAuthServer, UpstreamFailure>
}>()("api/connections/McpOAuthDiscovery") {
  static readonly layer = Layer.effect(McpOAuthDiscovery, Effect.gen(function*() {
    const environment = (yield* AppConfig).ENVIRONMENT
    return McpOAuthDiscovery.of({ discover: Effect.fn("McpOAuthDiscovery.discover")(function*(serverUrl: string) {
      yield* Effect.annotateCurrentSpan({ "mcp.server_url": serverUrl })
      const fetchFn = screenedFetch(yield* FetchHttpClient.Fetch, serverUrl, environment)
      const info = yield* Effect.tryPromise({
        try: () => discoverOAuthServerInfo(serverUrl, { fetchFn }),
        catch: (cause) => unavailable(serverUrl, `OAuth discovery failed: ${cause instanceof Error ? cause.message : String(cause)}`)
      })
      const metadata = yield* Schema.decodeUnknownEffect(AuthServerMetadata)(info.authorizationServerMetadata).pipe(
        Effect.mapError(() => unavailable(serverUrl, "the server publishes no usable OAuth authorization-server metadata"))
      )
      const checked = checkAuthServerMetadata(metadata, info.authorizationServerUrl, environment)
      if (Result.isFailure(checked)) return yield* unavailable(serverUrl, checked.failure)
      if (metadata.code_challenge_methods_supported !== undefined && !metadata.code_challenge_methods_supported.includes("S256")) {
        return yield* unavailable(serverUrl, "the authorization server does not support PKCE with S256")
      }
      const sdkMetadata = info.authorizationServerMetadata
      if (sdkMetadata === undefined) return yield* unavailable(serverUrl, "the server publishes no OAuth metadata")
      const prm = Schema.decodeUnknownOption(ResourceMetadata)(info.resourceMetadata)
      const requested = resourceUrlFromServerUrl(serverUrl)
      // RFC 9728 §3.3: metadata for another resource must not be used for this one.
      if (Option.isSome(prm) && !checkResourceAllowed({ requestedResource: requested, configuredResource: prm.value.resource })) {
        return yield* unavailable(serverUrl, `the protected-resource metadata is for ${prm.value.resource}, not this server`)
      }
      const scopes = Option.flatMap(prm, (found) => Option.fromUndefinedOr(found.scopes_supported)).pipe(
        Option.orElse(() => Option.fromUndefinedOr(metadata.scopes_supported)),
        Option.getOrElse((): ReadonlyArray<string> => [])
      )
      yield* Effect.annotateCurrentSpan({ "oauth.issuer": metadata.issuer, "oauth.dcr": metadata.registration_endpoint !== undefined })
      const server: McpAuthServer = {
        resource: Option.match(prm, { onNone: () => requested.href, onSome: (found) => found.resource }),
        authorizationServerUrl: info.authorizationServerUrl,
        metadata,
        sdkMetadata,
        scopes,
        userinfoUrl: checked.success.userinfoUrl
      }
      return server
    }) })
  }))
}

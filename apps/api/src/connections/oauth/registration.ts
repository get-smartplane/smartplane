import { registerClient } from "@modelcontextprotocol/client"
import { UpstreamFailure } from "@pc/domain"
import { Context, Effect, Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import type { ClientAuthentication, ConnectionClient } from "../credential"
import type { AuthServerMetadata, McpAuthServer } from "./discovery"

/** RFC 7591 §3.2.1, the fields Smartplane keeps. */
const RegisteredClient = Schema.Struct({
  client_id: Schema.NonEmptyString,
  client_secret: Schema.optional(Schema.String),
  token_endpoint_auth_method: Schema.optional(Schema.String)
})

const authentications: Readonly<Record<string, ClientAuthentication>> = {
  client_secret_basic: "header",
  client_secret_post: "body",
  none: "none"
}

/**
 * How Smartplane authenticates at this token endpoint: a confidential client when the server allows one (it
 * runs server-side and can keep a secret), otherwise a public client relying on PKCE alone. RFC 8414 defaults
 * an absent list to `client_secret_basic`.
 */
export const preferredAuthentication = (metadata: AuthServerMetadata): string => {
  const supported = metadata.token_endpoint_auth_methods_supported ?? ["client_secret_basic"]
  return ["client_secret_basic", "client_secret_post", "none"].find((method) => supported.includes(method)) ?? "none"
}

export const clientAuthenticationOf = (method: string | undefined): ClientAuthentication => authentications[method ?? "client_secret_basic"] ?? "header"

/** Dynamic client registration (RFC 7591) through the SDK, with the response decoded before it is trusted. */
export class McpClientRegistration extends Context.Service<McpClientRegistration, {
  readonly register: (server: McpAuthServer, redirectUri: string) => Effect.Effect<ConnectionClient, UpstreamFailure>
}>()("api/connections/McpClientRegistration") {
  static readonly layer = Layer.succeed(McpClientRegistration, {
    register: Effect.fn("McpClientRegistration.register")(function*(server: McpAuthServer, redirectUri: string) {
      const failed = (message: string) => new UpstreamFailure({ upstream: server.metadata.issuer, message })
      if (server.metadata.registration_endpoint === undefined) {
        return yield* failed("the authorization server does not support dynamic client registration; enter a client ID instead")
      }
      const fetchFn = yield* FetchHttpClient.Fetch
      const method = preferredAuthentication(server.metadata)
      const registered = yield* Effect.tryPromise({
        try: () =>
          registerClient(server.authorizationServerUrl, {
            metadata: server.sdkMetadata,
            clientMetadata: {
              client_name: "Smartplane",
              redirect_uris: [redirectUri],
              grant_types: ["authorization_code", "refresh_token"],
              response_types: ["code"],
              token_endpoint_auth_method: method
            },
            fetchFn
          }),
        catch: (cause) => failed(`dynamic client registration failed: ${cause instanceof Error ? cause.message : String(cause)}`)
      })
      const client = yield* Schema.decodeUnknownEffect(RegisteredClient)(registered).pipe(Effect.mapError(() => failed("the registration response had no client_id")))
      const authentication = clientAuthenticationOf(client.token_endpoint_auth_method ?? method)
      yield* Effect.annotateCurrentSpan({ "oauth.client_authentication": authentication })
      // A confidential method without an issued secret cannot work; fall back to a public client.
      const connectionClient: ConnectionClient = authentication !== "none" && client.client_secret !== undefined
        ? { clientId: client.client_id, authentication, clientSecret: client.client_secret }
        : { clientId: client.client_id, authentication: "none" }
      return connectionClient
    })
  })
}

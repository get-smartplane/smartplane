import { Context, Duration, Effect, Layer, Option, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { isLocalDevelopmentUrl } from "../../connections/oauth/endpoint-screen"
import { AppConfig } from "../../platform/config"

/**
 * RFC 6749 §2.3.1: a confidential client sends its secret by HTTP Basic or in the form body; a public client
 * (OAuth 2.1, e.g. one registered dynamically with `token_endpoint_auth_method: none`) sends only its id.
 */
export type OAuthClient =
  | { readonly clientId: string; readonly clientSecret: Redacted.Redacted<string>; readonly authentication: "header" | "body" }
  | { readonly clientId: string; readonly authentication: "none" }

/** The token endpoint refused or could not be reached. `error` is the provider's OAuth error code. */
export class TokenRequestFailed extends Schema.TaggedError<TokenRequestFailed>()("TokenRequestFailed", {
  status: Schema.NullOr(Schema.Int),
  error: Schema.NullOr(Schema.String)
}) {
  /** `invalid_grant`: the refresh token is revoked or expired; only a new authorization helps. */
  get revoked(): boolean {
    return this.error === "invalid_grant" || this.status === 401
  }
}

/** HTTPS only; plain http just for a loopback authorization server while developing. */
export const isSecureTokenUrl = (tokenUrl: string, environment: string): boolean => {
  try {
    return new URL(tokenUrl).protocol === "https:" || isLocalDevelopmentUrl(tokenUrl, environment)
  } catch {
    return false
  }
}

const ErrorBody = Schema.Struct({ error: Schema.String })
const decodeBody = Schema.decodeUnknownOption(Schema.JsonObject)
const RequestTimeout = Duration.seconds(15)

/** Posts grants to providers' token endpoints. Client secrets go only in the request, never in logs or spans. */
export class TokenEndpoint extends Context.Service<TokenEndpoint, {
  readonly request: (tokenUrl: string, client: OAuthClient, grant: Readonly<Record<string, string>>) => Effect.Effect<Schema.JsonObject, TokenRequestFailed>
}>()("api/integrations/TokenEndpoint") {
  static readonly layer = Layer.effect(
    TokenEndpoint,
    Effect.gen(function*() {
      const http = yield* HttpClient.HttpClient
      const environment = (yield* AppConfig).ENVIRONMENT
      return TokenEndpoint.of({
        request: Effect.fn("TokenEndpoint.request")(function*(tokenUrl: string, client: OAuthClient, grant: Readonly<Record<string, string>>) {
          yield* Effect.annotateCurrentSpan({ "oauth.grant_type": grant.grant_type ?? "", "url.full": tokenUrl })
          // Codes, refresh tokens and client secrets never travel in clear text.
          if (!isSecureTokenUrl(tokenUrl, environment)) return yield* new TokenRequestFailed({ status: null, error: "insecure_token_endpoint" })
          const body = client.authentication === "none" ? { ...grant, client_id: client.clientId }
            : client.authentication === "body" ? { ...grant, client_id: client.clientId, client_secret: Redacted.value(client.clientSecret) }
            : grant
          const headers = {
            accept: "application/json",
            ...(client.authentication === "header" ? { authorization: `Basic ${btoa(`${client.clientId}:${Redacted.value(client.clientSecret)}`)}` } : {})
          }
          const unreachable = () => new TokenRequestFailed({ status: null, error: null })
          const response = yield* http.execute(HttpClientRequest.post(tokenUrl, { headers }).pipe(HttpClientRequest.bodyUrlParams(body))).pipe(
            // A redirect would re-send the secret-bearing body to wherever it points; a 3xx is a failure instead.
            Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
            Effect.timeoutOrElse({ duration: RequestTimeout, orElse: () => Effect.fail(unreachable()) }),
            Effect.mapError(unreachable)
          )
          const json = Option.getOrUndefined(decodeBody(yield* response.json.pipe(Effect.orElseSucceed(() => null))))
          yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status })
          if (response.status >= 200 && response.status < 300 && json !== undefined) return json
          const error = Option.getOrNull(Option.map(Schema.decodeUnknownOption(ErrorBody)(json), (body) => body.error))
          return yield* new TokenRequestFailed({ status: response.status, error })
        })
      })
    })
  )
}

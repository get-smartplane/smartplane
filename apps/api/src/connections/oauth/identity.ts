import type { AccountIdentity } from "@pc/domain"
import { Duration, Effect, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import type { OAuthTokenSet } from "../../integrations/oauth/token-set"

/** OIDC standard claims (and GitHub-style `login`) that name an account. */
const Claims = Schema.Struct({
  sub: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  preferred_username: Schema.optional(Schema.String),
  login: Schema.optional(Schema.String),
  username: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String)
})
type Claims = typeof Claims.Type

const IdTokenField = Schema.Struct({ id_token: Schema.String })
const ClaimsJson = Schema.fromJsonString(Claims)

const identityOf = (claims: Claims): Option.Option<AccountIdentity> => {
  const username = claims.preferred_username ?? claims.login ?? claims.username
  const identity: AccountIdentity = {
    ...(claims.email === undefined ? {} : { email: claims.email.slice(0, 320) }),
    ...(username === undefined ? {} : { username: username.slice(0, 320) }),
    ...(claims.name === undefined ? {} : { name: claims.name.slice(0, 320) }),
    ...(claims.sub === undefined ? {} : { subject: claims.sub.slice(0, 320) })
  }
  return Object.keys(identity).length === 0 ? Option.none() : Option.some(identity)
}

const base64UrlJson = (segment: string): string => {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=")
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)))
}

/**
 * Claims of the `id_token` in a token response. It came straight from the token endpoint over TLS, which OIDC
 * Core §3.1.3.7 accepts in place of checking its signature; it is used for display and guard context only.
 */
export const idTokenIdentity = (data: Schema.JsonObject): Option.Option<AccountIdentity> =>
  Schema.decodeUnknownOption(IdTokenField)(data).pipe(
    Option.flatMap(({ id_token }) => Option.liftThrowable(base64UrlJson)(id_token.split(".")[1] ?? "")),
    Option.flatMap(Schema.decodeUnknownOption(ClaimsJson)),
    Option.flatMap(identityOf)
  )

/** The OIDC userinfo response for an access token; no identity when the endpoint fails or says nothing useful. */
const userinfoIdentity = (url: string, accessToken: string) =>
  Effect.gen(function*() {
    const http = yield* HttpClient.HttpClient
    // The access token goes to this URL only: no redirects.
    const request = HttpClientRequest.get(url, { headers: { accept: "application/json", authorization: `Bearer ${accessToken}` } })
    const response = yield* http.execute(request).pipe(Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }))
    if (response.status !== 200) return Option.none<AccountIdentity>()
    return Option.flatMap(Schema.decodeUnknownOption(Claims)(yield* response.json), identityOf)
  }).pipe(
    Effect.timeoutOrElse({ duration: Duration.seconds(5), orElse: () => Effect.succeed(Option.none<AccountIdentity>()) }),
    Effect.orElseSucceed(() => Option.none<AccountIdentity>()),
    Effect.withSpan("AccountIdentity.userinfo")
  )

/** Who the connected account is: the `id_token`'s claims, else the userinfo endpoint's; `null` when neither says. */
export const accountIdentityOf = (tokens: OAuthTokenSet, userinfoUrl: string | undefined): Effect.Effect<AccountIdentity | null, never, HttpClient.HttpClient> =>
  Option.match(idTokenIdentity(tokens.data), {
    onSome: (identity) => Effect.succeed(identity),
    onNone: () => (userinfoUrl === undefined ? Effect.succeed(null) : Effect.map(userinfoIdentity(userinfoUrl, tokens.accessToken), Option.getOrNull))
  })

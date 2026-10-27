import { Effect, Option, Schema } from "effect"

/** What the token secret holds, envelope-encrypted. Only apps/api reads it; runs get the access token only. */
export const OAuthTokenSet = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  refreshToken: Schema.optionalKey(Schema.NonEmptyString),
  tokenType: Schema.String,
  scope: Schema.String,
  /** Epoch milliseconds; `null` when the provider gave no lifetime. */
  expiresAt: Schema.NullOr(Schema.Number),
  /** The provider's whole token response: some pieces read extra fields (e.g. Slack's `authed_user`). */
  data: Schema.JsonObject
}).annotate({ identifier: "OAuthTokenSet" })
export type OAuthTokenSet = typeof OAuthTokenSet.Type

/** The secret's plaintext format. */
export const OAuthTokenSetJson = Schema.fromJsonString(Schema.toCodecJson(OAuthTokenSet))

/** RFC 6749 §5.1, leniently: some providers send `expires_in` as a string. Extra fields are kept in `data`. */
const TokenResponse = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.optional(Schema.String),
  token_type: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
  expires_in: Schema.optional(Schema.Union([Schema.Finite, Schema.NumberFromString]))
})

/** A provider answered without an access token, e.g. GitHub's 200 `{ "error": "bad_verification_code" }`. */
export class MalformedTokenResponse extends Schema.TaggedError<MalformedTokenResponse>()("MalformedTokenResponse", {
  error: Schema.NullOr(Schema.String)
}) {}

const providerError = Schema.decodeUnknownOption(Schema.Struct({ error: Schema.String }))

/**
 * The token set for a token endpoint response. On refresh, providers may omit the refresh token (keep the old
 * one) and the scope (keep the granted one).
 */
export const tokenSetFrom = (response: Schema.JsonObject, nowMs: number, previous?: OAuthTokenSet) =>
  Schema.decodeUnknownEffect(TokenResponse)(response).pipe(
    Effect.mapError(() => new MalformedTokenResponse({ error: Option.getOrNull(Option.map(providerError(response), ({ error }) => error)) })),
    Effect.map((token): OAuthTokenSet => {
      const refreshToken = token.refresh_token || previous?.refreshToken
      return {
        accessToken: token.access_token,
        ...(refreshToken ? { refreshToken } : {}),
        tokenType: token.token_type ?? previous?.tokenType ?? "bearer",
        scope: token.scope ?? previous?.scope ?? "",
        expiresAt: token.expires_in === undefined ? null : nowMs + token.expires_in * 1000,
        data: previous === undefined ? response : { ...previous.data, ...response }
      }
    })
  )

/** Refresh a minute early, so a token never expires mid-run. */
export const RefreshMarginMs = 60_000

export const needsRefresh = (tokens: OAuthTokenSet, nowMs: number): boolean =>
  tokens.refreshToken !== undefined && tokens.expiresAt !== null && tokens.expiresAt - RefreshMarginMs <= nowMs

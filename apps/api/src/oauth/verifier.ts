import { Unauthorized } from "@pc/domain"
import { Clock, Context, Effect, Layer, Redacted, Schema } from "effect"
import { createLocalJWKSet, decodeProtectedHeader, errors, jwtVerify } from "jose"
import { AuthKitKeys } from "./jwks"
import type { OAuthSettings } from "./settings"

/** The AuthKit access-token claims we rely on; `iss`, `aud` and `exp` are checked by `jwtVerify` first. */
export const AccessTokenClaims = Schema.Struct({
  /** The WorkOS user id. */
  sub: Schema.NonEmptyString,
  /** The WorkOS organization selected at sign-in, when one was. */
  org_id: Schema.optionalKey(Schema.NonEmptyString),
  sid: Schema.optionalKey(Schema.String),
  exp: Schema.Number
})
export type AccessTokenClaims = typeof AccessTokenClaims.Type

const ClockToleranceSeconds = 30

/** Verifies AuthKit-issued JWT access tokens for the MCP endpoint: signature, issuer, audience, expiry. */
export class AccessTokenVerifier extends Context.Service<AccessTokenVerifier, {
  readonly verify: (settings: OAuthSettings, token: Redacted.Redacted<string>) => Effect.Effect<AccessTokenClaims, Unauthorized>
}>()("api/oauth/AccessTokenVerifier") {
  static readonly layer = Layer.effect(
    AccessTokenVerifier,
    Effect.gen(function*() {
      const keys = yield* AuthKitKeys
      const invalid = new Unauthorized({ reason: "invalid_credentials" })

      const verify = Effect.fn("AccessTokenVerifier.verify")(function*(settings: OAuthSettings, token: Redacted.Redacted<string>) {
        const jwt = Redacted.value(token)
        const header = yield* Effect.try({ try: () => decodeProtectedHeader(jwt), catch: () => invalid })
        const set = yield* keys.forKey(settings.jwksUrl, header.kid).pipe(
          Effect.tapError((failure) => Effect.logWarning("authkit jwks unavailable", failure.message)),
          Effect.mapError(() => invalid)
        )
        const now = new Date(yield* Clock.currentTimeMillis)
        const verified = yield* Effect.tryPromise({
          try: () =>
            jwtVerify(jwt, createLocalJWKSet({ keys: [...set.keys] }), {
              issuer: settings.issuer,
              audience: settings.audience,
              algorithms: ["RS256", "ES256"],
              requiredClaims: ["exp", "sub"],
              clockTolerance: ClockToleranceSeconds,
              currentDate: now
            }),
          catch: (error) => (error instanceof errors.JWTExpired ? new Unauthorized({ reason: "expired" }) : invalid)
        })
        const claims = yield* Schema.decodeUnknownEffect(AccessTokenClaims)(verified.payload).pipe(Effect.mapError(() => invalid))
        yield* Effect.annotateCurrentSpan({ "oauth.org": claims.org_id ?? "none" })
        return claims
      })

      return AccessTokenVerifier.of({ verify })
    })
  )
}

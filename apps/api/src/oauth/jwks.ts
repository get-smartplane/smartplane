import { UpstreamFailure } from "@pc/domain"
import { Clock, Context, Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { KvCache } from "../platform/kv"

const optional = Schema.optionalKey(Schema.String)

/** Public signing keys (RSA or EC); unknown members are dropped. */
export const Jwk = Schema.Struct({ kty: Schema.NonEmptyString, kid: optional, alg: optional, use: optional, n: optional, e: optional, crv: optional, x: optional, y: optional })
export const JwkSet = Schema.Struct({ keys: Schema.Array(Jwk) })
export type JwkSet = typeof JwkSet.Type

const CachedJwks = Schema.Struct({ fetchedAt: Schema.Number, keys: JwkSet.fields.keys })

const CacheTtlSeconds = 3600
/** Key rotation shows up as an unknown `kid`; refetch then, but at most this often, so garbage tokens can't hammer AuthKit. */
const RefetchAfterMs = 60_000

/** AuthKit's JWKS, cached in KV. A token signed with a key we have not seen triggers one refetch. */
export class AuthKitKeys extends Context.Service<AuthKitKeys, {
  readonly forKey: (jwksUrl: string, kid: string | undefined) => Effect.Effect<JwkSet, UpstreamFailure>
}>()("api/oauth/AuthKitKeys") {
  static readonly layer = Layer.effect(
    AuthKitKeys,
    Effect.gen(function*() {
      const cache = yield* KvCache
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)

      const fetchKeys = Effect.fn("AuthKitKeys.fetch")(function*(jwksUrl: string) {
        const set = yield* client.get(jwksUrl).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(JwkSet)),
          Effect.mapError((error) => new UpstreamFailure({ upstream: "authkit", message: `jwks: ${error.message}` }))
        )
        yield* cache.set(`oauth-jwks:v1:${jwksUrl}`, CachedJwks, { fetchedAt: yield* Clock.currentTimeMillis, keys: set.keys }, CacheTtlSeconds)
        return set
      })

      const forKey = Effect.fn("AuthKitKeys.forKey")(function*(jwksUrl: string, kid: string | undefined) {
        const cached = yield* cache.get(`oauth-jwks:v1:${jwksUrl}`, CachedJwks)
        if (Option.isNone(cached)) return yield* fetchKeys(jwksUrl)
        const known = cached.value.keys.some((key) => kid === undefined || key.kid === kid)
        const stale = (yield* Clock.currentTimeMillis) - cached.value.fetchedAt > RefetchAfterMs
        yield* Effect.annotateCurrentSpan({ "oauth.jwks.cached": true, "oauth.jwks.known_kid": known })
        return !known && stale ? yield* fetchKeys(jwksUrl) : { keys: cached.value.keys }
      })

      return AuthKitKeys.of({ forKey })
    })
  )
}

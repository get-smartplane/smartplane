import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { authenticateSession, type SessionLike } from "./workos-session"

const user = { id: "user_01", email: "ada@example.com" }
const never = (): Promise<never> => Promise.reject(new Error("not called"))
/** The SDK's own HTTP errors carry a numeric `status`; an OAuth failure also carries `error`. */
const httpError = (status: number, error?: string) => Object.assign(new Error(`HTTP ${status}`), { status, ...(error === undefined ? {} : { error }) })

const expired: SessionLike["authenticate"] = async () => ({ authenticated: false, reason: "invalid_jwt" })
const tagOf = (session: SessionLike) => Effect.map(Effect.flip(authenticateSession(session)), (error) => error._tag)

describe("WorkOS session failures", () => {
  it.effect("a valid session authenticates; an expired one is refreshed", () =>
    Effect.gen(function*() {
      const ok = yield* authenticateSession({ authenticate: async () => ({ authenticated: true, user, organizationId: "org_1" }), refresh: never })
      assert.deepStrictEqual([ok.user, ok.organizationId, ok.refreshed], [user, "org_1", undefined])
      const renewed = yield* authenticateSession({ authenticate: expired, refresh: async () => ({ authenticated: true, user, sealedSession: "sealed" }) })
      assert.isDefined(renewed.refreshed)
    }))

  it.effect("real rejections are Unauthorized: invalid_grant, a malformed cookie, a 401", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* tagOf({ authenticate: expired, refresh: async () => ({ authenticated: false, reason: "invalid_grant", retryable: false }) }), "Unauthorized")
      assert.strictEqual(yield* tagOf({ authenticate: () => Promise.reject(new Error("Invalid seal")), refresh: never }), "Unauthorized")
      assert.strictEqual(yield* tagOf({ authenticate: expired, refresh: () => Promise.reject(httpError(400, "invalid_grant")) }), "Unauthorized")
      assert.strictEqual(yield* tagOf({ authenticate: () => Promise.reject(httpError(401)), refresh: never }), "Unauthorized")
    }))

  it.effect("an outage is UpstreamFailure, so nobody is logged out: network errors, 5xx, timeouts, retryable refreshes", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* tagOf({ authenticate: () => Promise.reject(new TypeError("fetch failed")), refresh: never }), "UpstreamFailure")
      assert.strictEqual(yield* tagOf({ authenticate: expired, refresh: () => Promise.reject(httpError(503)) }), "UpstreamFailure")
      assert.strictEqual(yield* tagOf({ authenticate: expired, refresh: async () => ({ authenticated: false, reason: "server_error", retryable: true }) }), "UpstreamFailure")
      const jwksTimeout = Object.assign(new Error("request timed out"), { code: "ERR_JWKS_TIMEOUT" })
      assert.strictEqual(yield* tagOf({ authenticate: () => Promise.reject(jwksTimeout), refresh: never }), "UpstreamFailure")
    }))
})

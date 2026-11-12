import { assert, describe, it } from "@effect/vitest"
import { BindingFailure } from "@pc/domain"
import { Effect, Layer, Logger } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { AuthKitKeys } from "../oauth/jwks"
import { bindingCall, logBindingFailure } from "./binding-call"
import { KvCache } from "./kv"

const kvRateLimit = () => Promise.reject(new Error("KV PUT failed: 429 Too Many Requests"))
const failing = (operation: string) => Effect.fail(new BindingFailure({ binding: "CACHE", operation, message: "KV PUT failed: 429 Too Many Requests" }))

const jwks = { keys: [{ kty: "RSA", kid: "authkit-1", n: "abc", e: "AQAB" }] }
const authKit = (fetches: Array<string>) =>
  Layer.succeed(HttpClient.HttpClient, HttpClient.make((request, url) =>
    Effect.sync(() => (fetches.push(url.toString()), HttpClientResponse.fromWeb(request, Response.json(jwks))))))

describe("Cloudflare binding failures", () => {
  it.effect("a rejected binding call is a typed BindingFailure, not a defect", () =>
    Effect.gen(function*() {
      const failure = yield* Effect.flip(bindingCall("CACHE", "put", kvRateLimit))
      assert.deepStrictEqual([failure._tag, failure.binding, failure.operation], ["BindingFailure", "CACHE", "put"])
      assert.include(failure.message, "429")
    }))

  it.effect("a best-effort write logs the failure and carries on", () => {
    const logs: Array<string> = []
    return Effect.gen(function*() {
      yield* bindingCall("CACHE", "put", kvRateLimit).pipe(Effect.asVoid, logBindingFailure("tool list cache write"))
      assert.strictEqual(logs.length, 1)
      assert.include(logs[0], "tool list cache write failed")
    }).pipe(Effect.provide(Logger.layer([Logger.make(({ message }) => void logs.push(JSON.stringify(message)))])))
  })

  it.effect("a JWKS cache that cannot be read or written does not fail an OAuth login", () => {
    const fetches: Array<string> = []
    const brokenKv = Layer.succeed(KvCache, { get: () => failing("get"), set: () => failing("put"), remove: () => failing("delete") })
    return Effect.gen(function*() {
      const keys = yield* AuthKitKeys.use((authKit) => authKit.forKey("https://acme.authkit.app/oauth2/jwks", "authkit-1"))
      assert.deepStrictEqual(keys.keys.map((key) => key.kid), ["authkit-1"])
      assert.strictEqual(fetches.length, 1)
    }).pipe(Effect.provide(AuthKitKeys.layer.pipe(Layer.provide([brokenKv, authKit(fetches)]))))
  })
})

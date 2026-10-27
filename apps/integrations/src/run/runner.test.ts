import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { callStore, entry, fakeCatalog, fakePieceModule, pick, request, run, runnerWith, secretAuth } from "../testing/harness"

const objectSchema = (properties: Record<string, { readonly type: string }>, required: Array<string> = []) => ({
  type: "object",
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false
})

const seen: Array<unknown> = []
const module = fakePieceModule({
  echo: { props: { name: { type: "SHORT_TEXT", required: true }, greeting: { type: "SHORT_TEXT", defaultValue: "hi" } }, run: (context) => (seen.push(context), "ok") },
  remember: {
    props: {},
    run: async (context) => {
      const before = await callStore(context, "get", "cursor")
      await callStore(context, "put", "cursor", { at: 2 })
      return { before, after: await callStore(context, "get", "cursor") }
    }
  },
  leaky: { props: {}, run: () => Promise.reject(Object.assign(new Error("401 from api with token sk_live_abcdef"), { response: { status: 401 } })) },
  server: { props: {}, run: (context) => pick(context, "server", "apiUrl") },
  big: { props: {}, run: () => ({ blob: "x".repeat(300_000), id: 10n, bytes: new Uint8Array(4) }) },
  hang: { props: {}, run: () => new Promise(() => undefined) },
  custom_api_call: { props: {}, run: (context) => pick(context, "propsValue", "url", "url") }
})

const catalog = fakeCatalog({
  "fake/echo": entry("echo", objectSchema({ name: { type: "string" }, greeting: { type: "string" } }, ["name"])),
  "fake/custom_api_call": entry("custom_api_call", { type: "object", properties: { url: { type: "object", properties: { url: { type: "string" } } } }, additionalProperties: false }),
  ...Object.fromEntries(["remember", "leaky", "server", "big", "hang"].map((name) => [`fake/${name}`, entry(name, objectSchema({}))]))
})

const layer = (store = new Map<string, string>()) => runnerWith(catalog, { fake: async () => module }, store)

describe("piece runner", () => {
  it.effect("validates input, applies piece defaults and passes the connection as Activepieces expects", () =>
    Effect.gen(function*() {
      seen.length = 0
      const result = yield* run(request("fake", "echo", { name: "Ada" }, secretAuth("sk_live_abcdef")))
      assert.deepStrictEqual([result.output, result.truncated], ["ok", false])
      assert.deepInclude(seen[0], { propsValue: { greeting: "hi", name: "Ada" }, auth: { type: "SECRET_TEXT", secret_text: "sk_live_abcdef" } })
      const invalid = yield* Effect.flip(run(request("fake", "echo", { name: 7 })))
      assert.strictEqual(invalid._tag, "InvalidInput")
      assert.strictEqual(seen.length, 1)
    }).pipe(Effect.provide(layer())))

  it.effect("refuses actions the catalog does not mark supported, before loading any piece", () =>
    Effect.gen(function*() {
      const unknown = yield* Effect.flip(run(request("fake", "nope", {})))
      assert.strictEqual(unknown._tag, "UnknownAction")
    }).pipe(Effect.provide(runnerWith(catalog, {}))))

  it.effect("keeps a custom_api_call on the provider's host, whatever apps/api sent", () =>
    Effect.gen(function*() {
      const refused = yield* Effect.flip(run(request("fake", "custom_api_call", { url: { url: "https://attacker.example/x" } }, secretAuth("sk_live_abcdef"))))
      assert.strictEqual(refused._tag, "InvalidInput")
      const relative = yield* run(request("fake", "custom_api_call", { url: { url: "/user" } }, secretAuth("sk_live_abcdef")))
      assert.strictEqual(relative.output, "/user")
    }).pipe(Effect.provide(layer())))

  it.effect("retries a piece whose import failed once", () => {
    let attempts = 0
    const flaky = async () => (attempts++ === 0 ? Promise.reject(new Error("transient")) : module)
    return Effect.gen(function*() {
      const failed = yield* Effect.flip(run(request("fake", "echo", { name: "Ada" })))
      assert.strictEqual(failed._tag, "UnsupportedAction")
      const result = yield* run(request("fake", "echo", { name: "Ada" }))
      assert.deepStrictEqual([result.output, attempts], ["ok", 2])
    }).pipe(Effect.provide(runnerWith(catalog, { fake: flaky })))
  })

  it.effect("scopes the store to the org and integration resource", () => {
    const store = new Map<string, string>()
    return Effect.gen(function*() {
      const first = yield* run(request("fake", "remember", {}))
      const second = yield* run(request("fake", "remember", {}))
      assert.deepStrictEqual([first.output, second.output], [{ before: null, after: { at: 2 } }, { before: { at: 2 }, after: { at: 2 } }])
      assert.deepStrictEqual([...store.keys()], ["integration-store:org_testorg01:res_integration1:COLLECTION:cursor"])
    }).pipe(Effect.provide(layer(store)))
  })

  it.effect("maps provider 401s to AuthFailed and scrubs the credential from the message", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(run(request("fake", "leaky", {}, secretAuth("sk_live_abcdef"))))
      assert.strictEqual(error._tag, "AuthFailed")
      if (error._tag === "AuthFailed") assert.strictEqual(error.message, "401 from api with token [redacted]")
    }).pipe(Effect.provide(layer())))

  it.effect("fails with UnsupportedAction when a piece reaches for Activepieces-only context", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(run(request("fake", "server", {})))
      assert.strictEqual(error._tag, "UnsupportedAction")
    }).pipe(Effect.provide(layer())))

  it.effect("returns JSON-safe output and truncates large results", () =>
    Effect.gen(function*() {
      const result = yield* run(request("fake", "big", {}))
      assert.isTrue(result.truncated)
      assert.include(JSON.stringify(result.output), "Output cut from")
    }).pipe(Effect.provide(layer())))

  it.effect("times out a run that never settles", () =>
    Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(Effect.flip(run(request("fake", "hang", {}))))
      yield* TestClock.adjust("30 seconds")
      const error = yield* Fiber.join(fiber)
      assert.strictEqual(error._tag, "Timeout")
    }).pipe(Effect.provide(layer())))
})

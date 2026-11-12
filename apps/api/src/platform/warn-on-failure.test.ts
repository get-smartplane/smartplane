import { assert, describe, it } from "@effect/vitest"
import { UpstreamFailure } from "@pc/domain"
import { Cause, Effect, Logger, Option } from "effect"
import { warnOnFailure } from "./warn-on-failure"

describe("failures discarded by Effect.option", () => {
  it.effect("are logged by tag only, never with their message (which can echo codes or tokens)", () => {
    const logs: Array<string> = []
    const logger = Logger.make(({ message, cause }) => void logs.push(`${JSON.stringify(message)} ${Cause.pretty(cause)}`))
    return Effect.gen(function*() {
      const exchange = Effect.fail(new UpstreamFailure({ upstream: "token endpoint", message: "invalid_grant for code=SplxlOBeZQQYbYS6WxSbIA" }))
      const result = yield* exchange.pipe(warnOnFailure("connection code exchange failed"), Effect.option)
      assert.isTrue(Option.isNone(result))
      assert.strictEqual(logs.length, 1)
      assert.include(logs[0], "connection code exchange failed")
      assert.include(logs[0], "UpstreamFailure")
      assert.notInclude(logs[0], "SplxlOBeZQQYbYS6WxSbIA")
      const ok = yield* Effect.succeed(1).pipe(warnOnFailure("unused"), Effect.option)
      assert.deepStrictEqual([ok, logs.length], [Option.some(1), 1])
    }).pipe(Effect.provide(Logger.layer([logger])))
  })
})

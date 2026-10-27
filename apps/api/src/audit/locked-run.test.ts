import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { type ObjectLock, runLocked } from "./locked-run"

/** Records what a real DurableObjectState would see: whether the locked callback rejected (a reset). */
const fakeLock = () => {
  const seen = { rejectedInside: false, flushedAfterLock: false, locked: false, waited: [] as Array<Promise<unknown>> }
  const lock: ObjectLock = {
    blockConcurrencyWhile: async (callback) => {
      seen.locked = true
      try {
        return await callback()
      } catch (error) {
        seen.rejectedInside = true
        throw error
      } finally {
        seen.locked = false
      }
    },
    waitUntil: (promise) => void seen.waited.push(promise)
  }
  return { lock, seen }
}

/** A runner that flushes telemetry through `waitUntil` when given one, like `makeRunner`. */
const run = <A, E>(effect: Effect.Effect<A, E>, waitUntil?: (promise: Promise<unknown>) => void) => {
  const result = Effect.runPromise(effect)
  waitUntil?.(Promise.resolve("flushed"))
  return result
}

describe("AuditLog object lock", () => {
  it.live("returns the value and flushes telemetry through waitUntil", () =>
    Effect.promise(async () => {
      const { lock, seen } = fakeLock()
      assert.strictEqual(await runLocked(lock, run, Effect.succeed(3)), 3)
      assert.strictEqual(seen.waited.length, 1)
      assert.isFalse(seen.rejectedInside)
    }))

  it.live("a failed append rejects the call but never rejects inside blockConcurrencyWhile", () =>
    Effect.promise(async () => {
      const { lock, seen } = fakeLock()
      const failed = await runLocked(lock, run, Effect.fail("d1 down")).then(() => "resolved", (error: unknown) => String(error))
      assert.include(failed, "d1 down")
      const died = await runLocked(lock, run, Effect.die(new Error("bug"))).then(() => "resolved", (error: unknown) => String(error))
      assert.include(died, "bug")
      const broken = <A, E>(_effect: Effect.Effect<A, E>): Promise<A> => Promise.reject(new Error("runtime"))
      const thrown = await runLocked(lock, broken, Effect.void).then(() => "resolved", (error: unknown) => String(error))
      assert.include(thrown, "runtime")
      assert.isFalse(seen.rejectedInside, "the object is never reset")
      assert.strictEqual(await runLocked(lock, run, Effect.succeed("next")), "next", "the next call works")
    }))
})

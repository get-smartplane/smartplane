import { assert, describe, it } from "@effect/vitest"
import { D1Client } from "@effect/sql-d1"
import { Effect, Layer, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { TestDatabase } from "../testing/database"
import { SingleUseStore, singleUseStates } from "./single-use-states"

const Pending = Schema.Struct({ userId: Schema.String, verifier: Schema.NullOr(Schema.String) })
const store = SingleUseStore.layer.pipe(Layer.provideMerge(TestDatabase))
const rowCount = Effect.flatMap(D1Client.D1Client, (sql) => sql<{ readonly n: number }>`SELECT COUNT(*) AS n FROM oauth_states`).pipe(Effect.map((rows) => rows[0]?.n))

describe("single-use OAuth states in D1", () => {
  it.effect("gives a state to exactly one of several concurrent takes", () =>
    Effect.gen(function*() {
      const states = singleUseStates(yield* SingleUseStore, "test-state:v1", Pending, 600)
      yield* states.put("s1", { userId: "usr_1", verifier: "v" })
      const taken = yield* Effect.all(Array.from({ length: 5 }, () => states.take("s1")), { concurrency: "unbounded" })
      assert.deepStrictEqual(taken.filter(Option.isSome).map((found) => found.value), [{ userId: "usr_1", verifier: "v" }])
      assert.isTrue(Option.isNone(yield* states.take("s1")))
      assert.isTrue(Option.isNone(yield* states.take("never-issued")))
    }).pipe(Effect.provide(store)))

  it.effect("does not hand out an expired state, and sweeps expired rows on later writes", () =>
    Effect.gen(function*() {
      const states = singleUseStates(yield* SingleUseStore, "test-state:v1", Pending, 600)
      yield* states.put("old", { userId: "usr_1", verifier: null })
      yield* states.put("kept", { userId: "usr_2", verifier: null })
      yield* TestClock.adjust("601 seconds")
      assert.isTrue(Option.isNone(yield* states.take("old")))
      assert.strictEqual(yield* rowCount, 1)
      yield* states.put("new", { userId: "usr_3", verifier: null })
      // "kept" expired too: the write above swept it, leaving only the new row.
      assert.strictEqual(yield* rowCount, 1)
      assert.isTrue(Option.isNone(yield* states.take("kept")))
      assert.deepStrictEqual(Option.getOrNull(yield* states.take("new")), { userId: "usr_3", verifier: null })
    }).pipe(Effect.provide(store)))

  it.effect("keeps prefixes apart", () =>
    Effect.gen(function*() {
      const store = yield* SingleUseStore
      const a = singleUseStates(store, "a", Pending, 600)
      const b = singleUseStates(store, "b", Pending, 600)
      yield* a.put("s", { userId: "usr_a", verifier: null })
      assert.isTrue(Option.isNone(yield* b.take("s")))
      assert.isTrue(Option.isSome(yield* a.take("s")))
    }).pipe(Effect.provide(store)))
})

import { assert, describe, it } from "@effect/vitest"
import type { GuardVerifyStage } from "@pc/domain"
import { Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import { admin, guard, guardWorld } from "../../testing/guard-world"
import { drainVerifyQueue } from "../../testing/verify-queue"
import { Guards } from "../guards"
import { GuardsRepo } from "../guards-repo"

const stored = Effect.flatMap(GuardsRepo, (repo) => Effect.map(repo.find(guard.orgId, guard.id), Option.getOrThrow))
const stages = (stages: ReadonlyArray<{ readonly stage: GuardVerifyStage }>) => stages.map((step) => step.stage)

describe("verify job failures and the admin at job time", () => {
  it.effect("retries a stage that fails transiently, then marks the run failed on its last attempt", () => {
    const { queue, layer } = guardWorld({ script: { drafts: "fail" } })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* (yield* Guards).compile(admin, guard.id)
      yield* drainVerifyQueue(queue)
      const failed = yield* stored
      assert.strictEqual(failed.verify?.stage, "failed")
      assert.include(failed.verify?.error ?? "", "Verify again")
      assert.deepStrictEqual(stages(failed.verify!.timeline), ["queued", "finding_targets", "drafting", "failed"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("a stage that fails once is queued again with its attempt count and goes on", () => {
    const { queue, layer } = guardWorld({ script: { drafts: 1 } })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* (yield* Guards).compile(admin, guard.id)
      const delivered = yield* drainVerifyQueue(queue)
      assert.strictEqual(delivered, 2)
      assert.strictEqual((yield* stored).verify?.stage, "done")
    }).pipe(Effect.provide(layer))
  })

  it.effect("re-checks the admin at job time: losing guards:manage stops the run", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* (yield* Guards).compile(admin, guard.id)
      yield* SqlClient.SqlClient.use((sql) => sql`UPDATE memberships SET role = 'member' WHERE id = 'mem_testmem01'`).pipe(Effect.orDie)
      yield* drainVerifyQueue(queue)
      const failed = yield* stored
      assert.strictEqual(failed.verify?.stage, "failed")
      assert.include(failed.verify?.error ?? "", "can no longer manage rules")
      assert.strictEqual(failed.compiled, null)
    }).pipe(Effect.provide(layer))
  })

  it.effect("an offboarded admin's run stops too", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* (yield* Guards).compile(admin, guard.id)
      yield* SqlClient.SqlClient.use((sql) => sql`UPDATE memberships SET status = 'deprovisioned' WHERE id = 'mem_testmem01'`).pipe(Effect.orDie)
      yield* drainVerifyQueue(queue)
      assert.include((yield* stored).verify?.error ?? "", "no longer a member")
    }).pipe(Effect.provide(layer))
  })

  it.effect("marks the run failed when it cannot be queued", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      queue.failSends = 1
      assert.strictEqual((yield* Effect.flip((yield* Guards).compile(admin, guard.id)))._tag, "UpstreamFailure")
      assert.strictEqual((yield* stored).verify?.stage, "failed")
    }).pipe(Effect.provide(layer))
  })
})

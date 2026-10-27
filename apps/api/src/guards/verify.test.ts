import { assert, describe, it } from "@effect/vitest"
import { type GuardVerifyStage, selfTestSummary } from "@pc/domain"
import { Effect, Option } from "effect"
import { admin, guard, guardWorld } from "../testing/guard-world"
import { drainVerifyQueue, type VerifyQueue } from "../testing/verify-queue"
import { Guards } from "./guards"
import { GuardsRepo } from "./guards-repo"
import { GuardTestCalls } from "./test-calls"
import { VerifyRunner } from "./verify-job/runner"

const stored = Effect.flatMap(GuardsRepo, (repo) => Effect.map(repo.find(guard.orgId, guard.id), Option.getOrThrow))
const stages = (stages: ReadonlyArray<{ readonly stage: GuardVerifyStage }>) => stages.map((step) => step.stage)

/** Runs one stage of the run the next queued message is for, and returns the guard as stored after it. */
const stepOnce = (queue: VerifyQueue) =>
  Effect.gen(function*() {
    const message = queue.sent[0]!.message
    const current = (yield* stored).verify
    const outcome = yield* (yield* VerifyRunner).step({ ...message, stage: current?.stage ?? message.stage })
    return { outcome, guard: yield* stored }
  })

describe("verify as one background job", () => {
  it.effect("answers at once with a queued run, then saves each stage as it starts and its results as it ends", () => {
    const { drafts, queue, events, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const started = yield* (yield* Guards).compile(admin, guard.id)
      // On the request: nothing drafted, the run queued, one small message on the queue.
      assert.strictEqual(started.verify?.stage, "queued")
      assert.strictEqual(started.compiled, null)
      assert.strictEqual(drafts.length, 0)
      assert.deepStrictEqual(queue.sent.map((sent) => [sent.message.stage, sent.message.attempt, sent.message.runId]), [["queued", 1, started.verify?.runId]])
      assert.deepStrictEqual(Object.keys(queue.jobs.get(started.verify!.runId)!.requester), ["userId", "membershipId", "tokenId", "projectId"])

      const seen: Array<[GuardVerifyStage | undefined, number, string | undefined]> = []
      for (let i = 0; i < 6; i++) {
        const { guard: now } = yield* stepOnce(queue)
        seen.push([now.verify?.stage, now.compiledVersion, now.compiled?.selfTest?.status])
      }
      assert.deepStrictEqual(seen, [
        ["finding_targets", 0, undefined],
        ["drafting", 0, undefined],
        // The first draft shows as soon as it is written, then again after its review.
        ["reviewing", 1, undefined],
        ["testing", 1, undefined],
        // Q1 misjudged the to-do calls: its results show while the recompile runs.
        ["retrying", 1, "running"],
        ["done", 2, "done"]
      ])
      const done = yield* stored
      assert.deepStrictEqual(stages(done.verify!.timeline), ["queued", "finding_targets", "drafting", "reviewing", "testing", "retrying", "done"])
      assert.strictEqual(done.status, "draft")
      assert.match(done.compiled?.instructions ?? "", /^Q2/)
      assert.deepStrictEqual(done.compiled?.operations, ["create", "update", "delete"])
      assert.deepStrictEqual(done.compiled?.selfTest?.recompiled, { fromVersion: 1, previousInstructions: "Q1: Does this call edit Notion with notion__notion-update-page?", mistakes: 3 })
      assert.strictEqual(selfTestSummary(done.compiled!.selfTest!), "Caught 3 of 3 calls that break it · allowed 3 of 3 that don't")
      assert.deepStrictEqual(done.compiled?.grounding?.targets.map((t) => [t.product, t.tools]), [["Notion", "curated"]])
      // Audited as the admin, each with the run id.
      assert.deepStrictEqual(events.map((e) => [e.type, e.data["version"], e.data["runId"]]), [
        ["guard.compiled", 1, started.verify?.runId],
        ["guard.compiled", 2, started.verify?.runId],
        ["guard.tested", 2, started.verify?.runId]
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect("one queue message carries the run through every stage", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* (yield* Guards).compile(admin, guard.id)
      assert.strictEqual(yield* drainVerifyQueue(queue), 1)
      assert.deepStrictEqual(queue.settled, ["ack"])
      assert.strictEqual((yield* stored).verify?.stage, "done")
    }).pipe(Effect.provide(layer))
  })

  it.effect("a newer verify makes the older run stale: it is dropped and never writes", () => {
    const { queue, events, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const guards = yield* Guards
      const first = yield* guards.compile(admin, guard.id)
      yield* stepOnce(queue)
      yield* stepOnce(queue) // the first run is now drafting
      const second = yield* guards.compile(admin, guard.id)
      const stale = yield* (yield* VerifyRunner).step({ ...queue.sent[0]!.message, stage: "drafting" })
      assert.strictEqual(stale._tag, "stale")
      assert.strictEqual((yield* stored).compiled, null)
      yield* drainVerifyQueue(queue)
      const done = yield* stored
      assert.strictEqual(done.verify?.runId, second.verify?.runId)
      assert.strictEqual(done.verify?.stage, "done")
      assert.notInclude(events.map((e) => e.data["runId"]), first.verify?.runId)
    }).pipe(Effect.provide(layer))
  })

  it.effect("Cancel ends the run: later stages are dropped, what was saved stays, a second cancel conflicts", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const guards = yield* Guards
      yield* guards.compile(admin, guard.id)
      for (let i = 0; i < 3; i++) yield* stepOnce(queue) // drafted, now reviewing
      const cancelled = yield* guards.cancelVerify(admin, guard.id)
      assert.strictEqual(cancelled.verify?.stage, "cancelled")
      assert.strictEqual((yield* (yield* VerifyRunner).step({ ...queue.sent[0]!.message, stage: "reviewing" }))._tag, "finished")
      const after = yield* stored
      assert.deepStrictEqual([after.verify?.stage, after.verify?.error, after.compiledVersion], ["cancelled", "Cancelled.", 1])
      assert.strictEqual((yield* Effect.flip(guards.cancelVerify(admin, guard.id)))._tag, "Conflict")
    }).pipe(Effect.provide(layer))
  })

  it.effect("editing the rule cancels its run, so the old wording's draft never lands", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const guards = yield* Guards
      yield* guards.compile(admin, guard.id)
      yield* stepOnce(queue)
      const edited = yield* guards.update(admin, guard.id, { rule: "nobody can delete the groceries list in notion" })
      assert.strictEqual(edited.verify?.stage, "cancelled")
      yield* drainVerifyQueue(queue)
      const after = yield* stored
      assert.deepStrictEqual([after.verify?.stage, after.compiled], ["cancelled", null])
      assert.include(after.verify?.error ?? "", "rule changed")
    }).pipe(Effect.provide(layer))
  })

  it.effect("never recompiles a rule someone activated while it was tested, and records how it tested", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const guards = yield* Guards
      yield* guards.compile(admin, guard.id)
      // Before the draft is final, activating would enforce a version about to be replaced.
      yield* stepOnce(queue)
      assert.strictEqual((yield* Effect.flip(guards.update(admin, guard.id, { status: "active" })))._tag, "Conflict")
      for (let i = 0; i < 3; i++) yield* stepOnce(queue) // now testing
      yield* guards.update(admin, guard.id, { status: "active" })
      yield* drainVerifyQueue(queue)
      const done = yield* stored
      assert.deepStrictEqual([done.status, done.compiledVersion, done.verify?.stage], ["active", 1, "done"])
      assert.match(done.compiled?.instructions ?? "", /^Q1/)
      assert.include(done.compiled?.selfTest?.note ?? "", "activated")
    }).pipe(Effect.provide(layer))
  })

  it.effect("still finishes when example generation fails, testing the draft's own examples", () => {
    const { queue, layer } = guardWorld({ script: { examples: "fail" } })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* (yield* Guards).compile(admin, guard.id)
      yield* drainVerifyQueue(queue)
      const done = yield* stored
      assert.strictEqual(done.compiled?.selfTest?.status, "done")
      assert.include(done.compiled?.selfTest?.note ?? "", "No example calls could be written")
      assert.deepStrictEqual([...new Set(done.compiled?.selfTest?.calls.map((call) => call.source))], ["draft"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("adds a custom call to the test set, runs it, and removes it again", () => {
    const { layer, queue, events } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* (yield* Guards).compile(admin, guard.id)
      yield* drainVerifyQueue(queue)
      const calls = yield* GuardTestCalls
      const added = yield* calls.add(admin, guard.id, {
        tool: "notion__notion-update-page",
        arguments: { page_id: "groceries-todo", properties: { Done: "__YES__" }, api_key: "do-not-store" },
        violates: true
      })
      assert.deepStrictEqual(added.testCalls[0]?.arguments, { page_id: "groceries-todo", properties: { Done: "__YES__" }, api_key: "[redacted]" })
      assert.strictEqual(added.compiled?.selfTest?.calls.filter((call) => call.source === "custom").length, 1)
      const removed = yield* calls.remove(admin, guard.id, added.testCalls[0]!.id)
      assert.strictEqual(removed.testCalls.length, 0)
      assert.deepStrictEqual(events.slice(-2).map((e) => Object.keys(e.data)[0]), ["testCallAdded", "testCallRemoved"])
    }).pipe(Effect.provide(layer))
  })
})

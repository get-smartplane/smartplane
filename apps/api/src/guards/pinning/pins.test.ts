import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { admin, foundTodo, guard, guardWorld, todoCandidate } from "../../testing/guard-world"
import { drainVerifyQueue } from "../../testing/verify-queue"
import { Guards } from "../guards"
import { GuardsRepo } from "../guards-repo"
import { GuardPins } from "./pins"

const stored = Effect.flatMap(GuardsRepo, (repo) => Effect.map(repo.find(guard.orgId, guard.id), Option.getOrThrow))

/** Verifies the rule until the run waits for the admin at `needs_confirmation`. */
const verifyUntilConfirmation = (queue: Parameters<typeof drainVerifyQueue>[0]) =>
  Effect.gen(function*() {
    yield* (yield* Guards).compile(admin, guard.id)
    yield* drainVerifyQueue(queue)
    return yield* stored
  })

describe("pin confirmation inside the verify job", () => {
  it.effect("pauses before testing with the candidates, pins nothing, and resumes testing once the admin confirms", () => {
    const { layer, queue, events, children } = guardWorld({ lookup: foundTodo })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const paused = yield* verifyUntilConfirmation(queue)
      assert.strictEqual(paused.verify?.stage, "needs_confirmation")
      // The draft is there to read while it waits; nothing is pinned and nothing is queued.
      assert.match(paused.compiled?.instructions ?? "", /^Q1/)
      assert.deepStrictEqual(paused.compiled?.pinning?.candidates, [todoCandidate])
      assert.deepStrictEqual(paused.pins, [])
      assert.strictEqual(paused.compiled?.selfTest, undefined)
      assert.strictEqual(queue.sent.length, 0)

      const pins = yield* GuardPins
      const pinned = yield* pins.confirm(admin, guard.id, { resourceId: todoCandidate.resourceId, entityId: todoCandidate.entityId })
      assert.strictEqual(pinned.verify?.stage, "testing")
      assert.deepStrictEqual(queue.sent.map((sent) => sent.message.stage), ["testing"])
      assert.deepStrictEqual(pinned.pins.map((pin) => [pin.label, pin.kind, pin.entityId, pin.url]), [["Todo", "database", todoCandidate.entityId, todoCandidate.url]])
      assert.deepStrictEqual(events.find((e) => e.data["pinAdded"] !== undefined)?.data["pinAdded"], { id: pinned.pins[0]!.id, resourceId: todoCandidate.resourceId, entityId: todoCandidate.entityId, label: "Todo", kind: "database" })

      yield* drainVerifyQueue(queue)
      const done = yield* stored
      assert.strictEqual(done.verify?.stage, "done")
      assert.deepStrictEqual(done.verify?.timeline.map((step) => step.stage), ["queued", "finding_targets", "drafting", "reviewing", "needs_confirmation", "testing", "retrying", "done"])
      assert.deepStrictEqual(done.pins, pinned.pins)
      assert.strictEqual(done.status, "draft")

      const pinId = pinned.pins[0]!.id
      children.set(pinId, ["1f2e8a4b9c3d4e5f8a7b6c5d4e3f2a1b", "2a3b4c5d6e7f4a8b9c0d1e2f3a4b5c6d"])
      assert.deepStrictEqual(yield* pins.stats(admin, guard.id), [{ pinId, children: 2 }])
      const unpinned = yield* pins.unpin(admin, guard.id, pinId)
      assert.deepStrictEqual(unpinned.pins, [])
      assert.isFalse(children.has(pinId))
    }).pipe(Effect.provide(layer))
  })

  it.effect("'continue' tests without pinning, and the candidates stay to confirm later", () => {
    const { layer, queue } = guardWorld({ lookup: foundTodo })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* verifyUntilConfirmation(queue)
      const guards = yield* Guards
      yield* guards.continueVerify(admin, guard.id)
      yield* drainVerifyQueue(queue)
      const done = yield* stored
      assert.deepStrictEqual([done.verify?.stage, done.pins.length, done.compiled?.pinning?.status], ["done", 0, "found"])
      assert.strictEqual((yield* Effect.flip(guards.continueVerify(admin, guard.id)))._tag, "Conflict")
    }).pipe(Effect.provide(layer))
  })

  it.effect("'none of these' resumes the run, keeps the rule semantic and survives verifying again", () => {
    const { layer, queue } = guardWorld({ lookup: foundTodo })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* verifyUntilConfirmation(queue)
      const dismissed = yield* (yield* GuardPins).dismiss(admin, guard.id)
      assert.deepStrictEqual([dismissed.compiled?.pinning?.status, dismissed.compiled?.pinning?.candidates.length, dismissed.verify?.stage], ["dismissed", 0, "testing"])
      yield* drainVerifyQueue(queue)
      yield* (yield* Guards).compile(admin, guard.id)
      yield* drainVerifyQueue(queue)
      const again = yield* stored
      // Dismissed stands: the second run does not pause again.
      assert.deepStrictEqual([again.compiled?.pinning?.status, again.verify?.stage], ["dismissed", "done"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("refuses to pin anything the lookup did not offer", () => {
    const { layer, queue } = guardWorld({ lookup: foundTodo })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* verifyUntilConfirmation(queue)
      const error = yield* Effect.flip((yield* GuardPins).confirm(admin, guard.id, { resourceId: todoCandidate.resourceId, entityId: "made-up-id" }))
      assert.strictEqual(error._tag, "Conflict")
      assert.strictEqual((yield* stored).verify?.stage, "needs_confirmation")
    }).pipe(Effect.provide(layer))
  })

  it.effect("only people who manage rules can pin", () => {
    const { layer, queue } = guardWorld({ lookup: foundTodo })
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      yield* verifyUntilConfirmation(queue)
      const viewer = { ...admin, permissions: ["resources:read" as const] }
      const error = yield* Effect.flip((yield* GuardPins).confirm(viewer, guard.id, { resourceId: todoCandidate.resourceId, entityId: todoCandidate.entityId }))
      assert.strictEqual(error._tag, "Forbidden")
    }).pipe(Effect.provide(layer))
  })
})

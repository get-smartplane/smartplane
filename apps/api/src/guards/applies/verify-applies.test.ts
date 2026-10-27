import { assert, describe, it } from "@effect/vitest"
import { type GuardId, ResourceId, TeamId, UserId } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import { admin, guard, guardWorld, seededMembers } from "../../testing/guard-world"
import { drainVerifyQueue } from "../../testing/verify-queue"
import { Guards } from "../guards"
import { GuardsRepo } from "../guards-repo"
import { consumeVerifyBatch } from "../verify-job/consumer"
import { VerifyMessage } from "../verify-job/job"

const notion = ResourceId.make("res_notion0001")
const find = (id: GuardId) => Effect.flatMap(GuardsRepo, (repo) => Effect.map(repo.find(guard.orgId, id), Option.getOrThrow))
const quick = { rule: "nobody can update todo list in notion without Dana's approval", threshold: 0.7, projectId: null, resourceIds: [] }

describe("verify derives the call filter and, for a quick-added rule, the mode", () => {
  it.effect("a rule added without a mode takes the mode and approvers its wording suggests, stays a draft, and suggests a filter", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      const created = yield* (yield* Guards).create(admin, quick)
      assert.isTrue(created.modeFollowsRule)
      assert.strictEqual(created.mode, "enforce")
      yield* (yield* Guards).compile(admin, created.id)
      yield* drainVerifyQueue(queue)
      const done = yield* find(created.id)
      assert.strictEqual(done.verify?.stage, "done")
      assert.strictEqual(done.status, "draft")
      assert.strictEqual(done.mode, "require_approval")
      assert.deepStrictEqual(done.approvers, [{ _tag: "User", userId: UserId.make(seededMembers[0].id) }])
      // Suggested, not accepted: the guard is still checked on every call in its scope.
      assert.strictEqual(done.applies, null)
      assert.deepStrictEqual(done.compiled?.applies?.resourceIds, [notion])
      assert.strictEqual(done.compiled?.applies?.operations, "changes")
      // The draft names update-page; the calls that break it also use create-pages. Both stay in.
      assert.deepStrictEqual(done.compiled?.applies?.tools?.[0]?.only, ["notion-update-page", "notion-create-pages"])
      assert.deepStrictEqual(done.compiled?.references, { people: true, accounts: [] })
    }).pipe(Effect.provide(layer))
  })

  it.effect("a mode chosen by hand while verify runs is never overwritten", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      const guards = yield* Guards
      const created = yield* guards.create(admin, quick)
      yield* guards.compile(admin, created.id)
      yield* guards.update(admin, created.id, { mode: "monitor" })
      yield* drainVerifyQueue(queue)
      const done = yield* find(created.id)
      assert.deepStrictEqual([done.mode, done.modeFollowsRule, done.approvers], ["monitor", false, []])
    }).pipe(Effect.provide(layer))
  })

  it.effect("an admin accepts the suggested filter; editing the rule drops it", () => {
    const { queue, layer } = guardWorld()
    return Effect.gen(function*() {
      const guards = yield* Guards
      yield* (yield* GuardsRepo).insert(guard)
      yield* guards.compile(admin, guard.id)
      yield* drainVerifyQueue(queue)
      const suggested = (yield* find(guard.id)).compiled?.applies
      assert.isDefined(suggested)
      const accepted = yield* guards.update(admin, guard.id, { applies: suggested ?? null })
      assert.deepStrictEqual(accepted.applies, suggested)
      assert.deepStrictEqual((yield* find(guard.id)).applies, suggested)
      const edited = yield* guards.update(admin, guard.id, { rule: "nobody can delete pages in notion" })
      assert.strictEqual(edited.applies, null)
      assert.strictEqual((yield* find(guard.id)).applies, null)
    }).pipe(Effect.provide(layer))
  })

  it.effect("a filter naming another org's team is refused", () => {
    const { layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(guard)
      const refused = yield* Effect.flip((yield* Guards).update(admin, guard.id, { applies: { resourceIds: [], actors: { kind: "only", refs: [{ _tag: "Team", teamId: TeamId.make("team_elsewher1") }] } } }))
      assert.strictEqual(refused._tag, "NotFound")
    }).pipe(Effect.provide(layer))
  })
})

describe("parallel verify runs", () => {
  it.effect("runs for different guards of one org proceed side by side without stepping on each other", () => {
    const { queue, layer } = guardWorld()
    const encode = Schema.encodeSync(Schema.toCodecJson(VerifyMessage))
    return Effect.gen(function*() {
      const guards = yield* Guards
      const rules = ["nobody can update todo list in notion", "nobody can delete pages in notion", "contractors can't edit notion docs"]
      const created = yield* Effect.forEach(rules, (rule) => guards.create(admin, { rule, threshold: 0.7, projectId: null, resourceIds: [] }))
      yield* Effect.forEach(created, (rule) => guards.compile(admin, rule.id))
      // Every message in flight at once, like three consumer invocations; then whatever they re-queued.
      while (queue.sent.length > 0) {
        const batch = queue.sent.splice(0)
        yield* Effect.forEach(batch, ({ message }) => consumeVerifyBatch([{ body: encode(message), ack: () => undefined, retry: () => undefined, attempts: 1 }]), { concurrency: "unbounded" })
      }
      const done = yield* Effect.forEach(created, (rule) => find(rule.id))
      assert.deepStrictEqual(done.map((rule) => rule.verify?.stage), ["done", "done", "done"])
      assert.deepStrictEqual(done.map((rule) => rule.rule), rules)
      assert.strictEqual(new Set(done.map((rule) => rule.verify?.runId)).size, 3)
    }).pipe(Effect.provide(layer))
  })
})

import { assert, describe, it } from "@effect/vitest"
import { ResourceId, RoleSlug } from "@pc/domain"
import { Effect, Option } from "effect"
import { userPrincipal } from "../../testing/fixtures"
import { admin, guardWorld } from "../../testing/guard-world"
import { Guards } from "../guards"
import { GuardsRepo } from "../guards-repo"
import { preparedNote, GuardStarters } from "./starters"

const notion = ResourceId.make("res_notion0001")
const input = { starterId: "no-deletions", mode: "monitor", threshold: 0.7, projectId: null, resourceIds: [notion] } as const

describe("GuardStarters.create", () => {
  it.effect("saves a compiled draft with its verify done, without queueing a run, and audits it like a verified rule", () => {
    const { queue, events, states, layer } = guardWorld()
    return Effect.gen(function*() {
      const guard = yield* (yield* GuardStarters).create(admin, input)
      assert.strictEqual(guard.rule, "Agents never delete anything.")
      assert.strictEqual(guard.status, "draft")
      assert.strictEqual(guard.mode, "monitor")
      assert.strictEqual(guard.compiled?.starter, "no-deletions")
      assert.include(guard.compiled?.instructions ?? "", "whatever it is called")
      assert.deepStrictEqual([guard.verify?.stage, guard.verify?.note], ["done", preparedNote])
      assert.deepStrictEqual(guard.applies, { resourceIds: [notion], operations: "changes" })
      assert.strictEqual(queue.sent.length, 0)
      assert.deepStrictEqual(events.map((event) => event.type), ["guard.created", "guard.compiled"])
      assert.strictEqual(events[1]?.data["prepared"], true)

      const stored = Option.getOrUndefined(yield* (yield* GuardsRepo).find(guard.orgId, guard.id))
      assert.deepStrictEqual([stored?.compiled?.starter, stored?.verify?.stage], ["no-deletions", "done"])

      // Ready at once: it can be tested and switched on.
      const guards = yield* Guards
      yield* guards.test(admin, guard.id, { tool: "delete_file", arguments: { path: "/reports/Q3/summary.pdf" }, actor: { role: "member", teams: [] } })
      assert.include(JSON.stringify(states.at(-1)), "Does this call delete")
      const active = yield* guards.update(admin, guard.id, { status: "active", mode: "monitor" })
      assert.strictEqual(active.status, "active")
    }).pipe(Effect.provide(layer))
  })

  it.effect("takes the rule's own mode when none is chosen", () => {
    const { layer } = guardWorld()
    return Effect.gen(function*() {
      const { mode: _mode, ...rest } = input
      const guard = yield* (yield* GuardStarters).create(admin, { ...rest, starterId: "database-read-only", resourceIds: [] })
      assert.strictEqual(guard.mode, "enforce")
      assert.deepStrictEqual(guard.applies, { resourceIds: [], operations: "changes" })
    }).pipe(Effect.provide(layer))
  })

  it.effect("refuses members without guards:manage and resources of another org", () => {
    const { layer } = guardWorld()
    return Effect.gen(function*() {
      const starters = yield* GuardStarters
      const member = userPrincipal({ role: RoleSlug.make("member"), permissions: ["resources:read"] })
      assert.strictEqual((yield* Effect.flip(starters.create(member, input)))._tag, "Forbidden")
      const missing = yield* Effect.flip(starters.create(admin, { ...input, resourceIds: [ResourceId.make("res_elsewhere1")] }))
      assert.strictEqual(missing._tag, "NotFound")
    }).pipe(Effect.provide(layer))
  })
})

import { assert, describe, it } from "@effect/vitest"
import { type Guard, GuardId, RoleSlug } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { TestDatabase } from "../testing/database"
import { now, orgId, userId } from "../testing/fixtures"
import { seedOrg } from "../testing/seed"
import { GuardsRepo } from "./guards-repo"

const layer = Layer.provideMerge(Layer.effectDiscard(seedOrg), GuardsRepo.layer.pipe(Layer.provideMerge(TestDatabase)))

const guard: Guard = {
  id: GuardId.make("grd_linear0001"),
  orgId,
  projectId: null,
  resourceIds: [],
  name: "nobody creates issues on linear without my permission",
  nameFollowsRule: true,
  modeFollowsRule: false,
  applies: null,
  rule: "nobody creates issues on linear without my permission",
  mode: "require_approval",
  approvers: [{ _tag: "Author" }, { _tag: "Role", role: RoleSlug.make("admin") }],
  threshold: 0.7,
  status: "draft",
  compiled: {
    instructions: "Does this action create an issue in Linear?",
    examples: [],
    suggestion: { mode: "require_approval", approvers: [{ _tag: "Author" }], unresolved: [], cue: "without my permission" }
  },
  compiledVersion: 1,
  testCalls: [],
  pins: [],
  verify: null,
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}

describe("GuardsRepo", () => {
  it.effect("stores approvers, the name-follows-rule flag and the compile suggestion", () =>
    Effect.gen(function*() {
      const repo = yield* GuardsRepo
      yield* repo.insert(guard)
      yield* repo.save({ ...guard, name: "Linear lock", nameFollowsRule: false })
      const stored = Option.getOrThrow(yield* repo.find(orgId, guard.id))
      assert.deepStrictEqual([stored.name, stored.nameFollowsRule], ["Linear lock", false])
      assert.deepStrictEqual(stored.approvers, guard.approvers)
      assert.deepStrictEqual(stored.compiled?.suggestion, guard.compiled?.suggestion)
    }).pipe(Effect.provide(layer)))
})

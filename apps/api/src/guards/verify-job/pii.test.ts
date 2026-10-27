import { assert, describe, it } from "@effect/vitest"
import { UserId } from "@pc/domain"
import { Effect, Option } from "effect"
import { admin, guard, guardWorld, seededMembers } from "../../testing/guard-world"
import { drainVerifyQueue } from "../../testing/verify-queue"
import { describeDirectory } from "../compile/directory"
import { evalDirectory } from "../compile/eval-set"
import { Guards } from "../guards"
import { GuardsRepo } from "../guards-repo"

const approvalRule = { ...guard, rule: "nobody can update todo list in notion without Dana's approval", name: "todo list approval" }
const stored = Effect.flatMap(GuardsRepo, (repo) => Effect.map(repo.find(guard.orgId, guard.id), Option.getOrThrow))

describe("no member data in model inputs", () => {
  it("the compiler's directory lists roles and teams, never members", () => {
    const text = describeDirectory(evalDirectory)
    assert.include(text, "Teams: Finance, Security, Contractors")
    for (const member of evalDirectory.members) {
      assert.notInclude(text, member.email)
      assert.notInclude(text, member.name ?? "")
    }
  })

  it.effect("a whole verify run sends no member's email or name to any model or the classifier, and still resolves Dana", () => {
    const { inputs, states, queue, layer } = guardWorld()
    return Effect.gen(function*() {
      yield* (yield* GuardsRepo).insert(approvalRule)
      yield* (yield* Guards).compile(admin, guard.id)
      yield* drainVerifyQueue(queue)
      const done = yield* stored
      assert.strictEqual(done.verify?.stage, "done")
      assert.isAbove(inputs.length, 2)

      const seen = JSON.stringify([inputs, states]).toLowerCase()
      // The verifying admin (seeded as ada@example.com) and every other member.
      for (const email of ["ada@example.com", ...seededMembers.map((member) => member.email)]) assert.notInclude(seen, email.toLowerCase())
      for (const name of ["Scully", "Mulder", "Fox"]) assert.notInclude(seen, name.toLowerCase())
      assert.notInclude(seen, "members:")

      // "Dana" is the rule's own word; the person is found locally after drafting.
      assert.deepStrictEqual(done.compiled?.suggestion?.approvers, [{ _tag: "User", userId: UserId.make(seededMembers[0].id) }])
    }).pipe(Effect.provide(layer))
  })
})

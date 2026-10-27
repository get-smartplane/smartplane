import { assert, describe, it } from "@effect/vitest"
import { type Guard, GuardId, ResourceId, RoleSlug } from "@pc/domain"
import { now, orgId, userId } from "../testing/fixtures"
import { applyEdits, initialName } from "./guard-edits"

const base = { mode: "enforce", threshold: 0.7, projectId: null, resourceIds: [] } as const

const guard = (overrides: Partial<Guard> = {}): Guard => ({
  id: GuardId.make("grd_linear0001"),
  orgId,
  ...base,
  name: "nobody deletes issues on linear about mrs. robinson",
  nameFollowsRule: true,
  modeFollowsRule: false,
  applies: null,
  rule: "nobody deletes issues on linear about mrs. robinson",
  approvers: [],
  status: "active",
  compiled: { instructions: "Does this action delete a Linear issue about Mrs. Robinson?", examples: [] },
  compiledVersion: 3,
  testCalls: [],
  pins: [],
  verify: null,
  createdBy: userId,
  createdAt: now,
  updatedAt: null,
  ...overrides
})

describe("guard names", () => {
  it("follow the rule unless someone typed one", () => {
    assert.deepStrictEqual(initialName({ ...base, rule: "Nobody deletes Q3 reports. Ask Dana." }), { name: "Nobody deletes Q3 reports", nameFollowsRule: true })
    // Older dashboards always sent the derived name; it still counts as derived.
    assert.isTrue(initialName({ ...base, rule: "nobody deletes Q3 reports", name: "nobody deletes Q3 reports" }).nameFollowsRule)
    assert.deepStrictEqual(initialName({ ...base, rule: "nobody deletes Q3 reports", name: "Q3 lock" }), { name: "Q3 lock", nameFollowsRule: false })
  })

  it("rename with the rule text when it was derived", () => {
    const next = applyEdits(guard(), { rule: "nobody creates issues on linear without my permission" })
    assert.strictEqual(next.name, "nobody creates issues on linear without my permission")
    assert.isTrue(next.nameFollowsRule)
  })

  it("stay when named by hand, and follow again when set back to the derived name", () => {
    const named = applyEdits(guard(), { name: "Linear lock" })
    assert.isFalse(named.nameFollowsRule)
    const edited = applyEdits(named, { rule: "nobody creates issues on linear without my permission" })
    assert.strictEqual(edited.name, "Linear lock")
    const reset = applyEdits(edited, { name: "nobody creates issues on linear without my permission" })
    assert.isTrue(reset.nameFollowsRule)
  })
})

describe("rule edits", () => {
  it("drop the compiled prompt of the old rule and return the guard to draft", () => {
    const next = applyEdits(guard(), { rule: "nobody creates issues on linear without my permission", status: "active" })
    assert.strictEqual(next.status, "draft")
    assert.isNull(next.compiled)
    assert.strictEqual(next.compiledVersion, 3)
  })

  it("drop the pins confirmed for the old wording, and keep them for other edits", () => {
    const pin = { id: "pin_todo0001", resourceId: ResourceId.make("res_notion0001"), entityId: "8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f", label: "Todo", kind: "database", pinnedBy: userId, pinnedAt: now }
    assert.deepStrictEqual(applyEdits(guard({ pins: [pin] }), { rule: "nobody can update the groceries list" }).pins, [])
    assert.deepStrictEqual(applyEdits(guard({ pins: [pin] }), { mode: "monitor" }).pins, [pin])
  })

  it("leave the compiled prompt alone for mode, approver and name changes", () => {
    const approvers = [{ _tag: "Role", role: RoleSlug.make("admin") }] as const
    const next = applyEdits(guard(), { mode: "require_approval", approvers, name: "Linear" })
    assert.strictEqual(next.status, "active")
    assert.isNotNull(next.compiled)
    assert.deepStrictEqual(next.approvers, approvers)
  })
})

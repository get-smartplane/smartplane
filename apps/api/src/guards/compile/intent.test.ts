import { assert, describe, it } from "@effect/vitest"
import { RoleSlug, sameApprovers, TeamId, UserId } from "@pc/domain"
import { resolveApprover } from "./directory"
import { evalDirectory, evalSet } from "./eval-set"
import { readIntent } from "./intent"
import { suggestionFor } from "./suggest"

describe("readIntent", () => {
  it.each([
    ["nobody creates issues on linear without my permission", "require_approval", ["my"]],
    ["ask before posting in #general", "require_approval", []],
    ["agents need an admin's sign-off before deleting customer records", "require_approval", ["admin's"]],
    ["refunds over $500 need sign-off from finance or legal", "require_approval", ["finance", "legal"]],
    ["deploys must be approved by Dana", "require_approval", ["Dana"]],
    ["alert me when anyone exports customer data", "monitor", []],
    ["let me know when someone shares a file publicly", "monitor", []],
    ["only finance can send email from billing@", "enforce", []],
    ["never run DROP or TRUNCATE on the orders db", "enforce", []],
    ["contractors can't push to main", "enforce", []]
  ] as const)("%s → %s", (rule, mode, approvers) => {
    const intent = readIntent(rule)
    assert.strictEqual(intent.mode, mode)
    assert.deepStrictEqual(intent.approverPhrases, approvers)
  })
})

describe("resolveApprover", () => {
  it("resolves the author, roles, teams and members, and keeps unknown names", () => {
    assert.deepStrictEqual(resolveApprover("my", evalDirectory), { _tag: "Author" })
    assert.deepStrictEqual(resolveApprover("an admin's", evalDirectory), { _tag: "Role", role: RoleSlug.make("admin") })
    assert.deepStrictEqual(resolveApprover("admins", evalDirectory), { _tag: "Role", role: RoleSlug.make("admin") })
    assert.deepStrictEqual(resolveApprover("the security team's", evalDirectory), { _tag: "Team", teamId: TeamId.make("team_security1") })
    assert.deepStrictEqual(resolveApprover("Dana's", evalDirectory), { _tag: "User", userId: UserId.make("usr_dana00001") })
    assert.deepStrictEqual(resolveApprover("ian@acme.com", evalDirectory), { _tag: "User", userId: UserId.make("usr_founder001") })
    assert.strictEqual(resolveApprover("the legal team", evalDirectory), "the legal team")
  })
})

describe("suggestionFor (wording alone, no model)", () => {
  for (const testCase of evalSet) {
    it(testCase.rule, () => {
      const suggestion = suggestionFor(testCase.rule, undefined, evalDirectory)
      assert.strictEqual(suggestion.mode, testCase.mode)
      assert.isTrue(sameApprovers(suggestion.approvers, testCase.approvers ?? []), JSON.stringify(suggestion.approvers))
    })
  }

  it("takes the model's reading when the wording has no approval or monitor cue", () => {
    const draft = {
      intent: { mode: "require_approval" as const, approvers: [{ kind: "team" as const, ref: "Security" }], cue: "unless security reviewed it" },
      instructions: "Does this action merge a pull request?",
      examples: []
    }
    const suggestion = suggestionFor("never merge to main unless security reviewed it", draft, evalDirectory)
    assert.strictEqual(suggestion.mode, "require_approval")
    assert.deepStrictEqual(suggestion.approvers, [{ _tag: "Team", teamId: TeamId.make("team_security1") }])
  })

  it("lists approvers it cannot resolve for the reviewer instead of guessing", () => {
    const suggestion = suggestionFor("no refunds without legal's approval", undefined, evalDirectory)
    assert.deepStrictEqual(suggestion.approvers, [])
    assert.deepStrictEqual(suggestion.unresolved, ["legal's"])
  })
})

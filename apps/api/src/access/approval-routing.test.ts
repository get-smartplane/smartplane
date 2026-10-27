import { assert, describe, it } from "@effect/vitest"
import { type GuardApprover, RoleSlug, TeamId } from "@pc/domain"
import { otherUserId, serviceAccountPrincipal, userId, userPrincipal } from "../testing/fixtures"
import { exemptFromApproval, mayDecide } from "./approval-routing"

const author = userPrincipal()
const colleague = userPrincipal({ userId: otherUserId, email: "eve@example.com" })
const admin = userPrincipal({ userId: otherUserId, role: RoleSlug.make("admin"), permissions: ["approvals:decide"] })
const guardWith = (...approvers: Array<GuardApprover>) => ({ approvers, createdBy: userId })
const requestBy = (id: typeof userId) => ({ requestedBy: { type: "user" as const, id } })

describe("exemptFromApproval", () => {
  it("exempts the author from a rule that needs only the author's permission", () => {
    assert.isTrue(exemptFromApproval(guardWith({ _tag: "Author" }), author))
    assert.isFalse(exemptFromApproval(guardWith({ _tag: "Author" }), colleague))
    assert.isFalse(exemptFromApproval(guardWith({ _tag: "Author" }), serviceAccountPrincipal()))
  })

  it("does not exempt anyone when someone besides the author approves, or nobody is named", () => {
    assert.isFalse(exemptFromApproval(guardWith({ _tag: "Author" }, { _tag: "Role", role: RoleSlug.make("admin") }), author))
    assert.isFalse(exemptFromApproval(guardWith(), author))
  })
})

describe("mayDecide", () => {
  it("never lets anyone decide their own request", () => {
    assert.isFalse(mayDecide(admin, requestBy(otherUserId), guardWith(), true))
    assert.isFalse(mayDecide(author, requestBy(userId), guardWith({ _tag: "Author" }), false))
  })

  it("routes to the named approvers only", () => {
    const security = TeamId.make("team_security1")
    const guard = guardWith({ _tag: "Team", teamId: security })
    assert.isTrue(mayDecide(userPrincipal({ userId: otherUserId, teamIds: [security] }), requestBy(userId), guard, true))
    assert.isFalse(mayDecide(admin, requestBy(userId), guard, true))
    assert.isTrue(mayDecide(author, requestBy(otherUserId), guardWith({ _tag: "Author" }), true))
  })

  it("falls back to approvals:decide holders when no other approver exists", () => {
    const onlyTheRequester = guardWith({ _tag: "Role", role: RoleSlug.make("owner") })
    assert.isTrue(mayDecide(admin, requestBy(userId), onlyTheRequester, false))
    assert.isFalse(mayDecide(colleague, requestBy(userId), onlyTheRequester, false))
  })

  it("keeps the old rule for guards without approvers", () => {
    assert.isTrue(mayDecide(admin, requestBy(userId), guardWith(), false))
    assert.isFalse(mayDecide(colleague, requestBy(userId), guardWith(), false))
  })
})

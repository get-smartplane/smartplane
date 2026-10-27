import { type Approval, type Guard, type GuardApprover, hasPermission, type Principal, type UserId } from "@pc/domain"

type UserPrincipal = Extract<Principal, { _tag: "User" }>

/** Does `user` hold the approver slot `approver` on `guard`? */
export const holdsApprover = (approver: GuardApprover, guard: Pick<Guard, "createdBy">, user: UserPrincipal): boolean => {
  switch (approver._tag) {
    case "Author":
      return user.userId === guard.createdBy
    case "Role":
      return user.role === approver.role
    case "Team":
      return user.teamIds.includes(approver.teamId)
    case "User":
      return user.userId === approver.userId
  }
}

/**
 * Separation of duties for "without MY permission": when the rule's author is its only approver, the
 * author's own actions are exempt. The rule reserves the author's consent, and an action the author takes
 * already carries it; requiring someone else to approve would invert the rule. With any other approver
 * set (a role, a team, a named person) the actor's own approval never counts and someone else decides.
 */
export const exemptFromApproval = (guard: Pick<Guard, "approvers" | "createdBy">, principal: Principal): boolean =>
  principal._tag === "User" && principal.userId === guard.createdBy &&
  guard.approvers.length > 0 && guard.approvers.every((approver) => approver._tag === "Author")

/**
 * May `user` decide `approval`? Never their own request. A guard without approvers routes to anyone with
 * `approvals:decide`, as before approvers existed. A guard with approvers routes to them only, except that
 * when no approver other than the requester exists (`othersAvailable` false), `approvals:decide` holders
 * step in so a request can never be stuck with nobody allowed to decide it.
 */
export const mayDecide = (
  user: Principal,
  approval: Pick<Approval, "requestedBy">,
  guard: Pick<Guard, "approvers" | "createdBy"> | undefined,
  othersAvailable: boolean
): boolean => {
  if (user._tag !== "User") return false
  if (approval.requestedBy.type === "user" && approval.requestedBy.id === user.userId) return false
  const canDecideAny = hasPermission(user, "approvals:decide")
  if (guard === undefined || guard.approvers.length === 0) return canDecideAny
  if (guard.approvers.some((approver) => holdsApprover(approver, guard, user))) return true
  return canDecideAny && !othersAvailable
}

/** Users who hold any approver slot, minus the requester: if empty, the fallback in `mayDecide` applies. */
export const otherApprovers = (pool: ReadonlyArray<UserId>, requester: Approval["requestedBy"]): ReadonlyArray<UserId> =>
  pool.filter((id) => !(requester.type === "user" && requester.id === id))

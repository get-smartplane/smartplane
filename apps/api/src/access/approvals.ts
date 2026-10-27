import {
  type Approval,
  type ApprovalId,
  type ApprovalRequest,
  Conflict,
  type DecideApproval,
  Forbidden,
  type Guard,
  type GuardId,
  NotFound,
  type OrgId,
  type Principal,
  type UserId
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { actorOf } from "../audit/actor"
import { AuditLog } from "../audit/audit-log"
import { canonicalJson } from "../audit/canonical-json"
import { requirePermission, requireUser } from "../auth/permissions"
import { sha256Hex } from "../platform/encoding"
import { GuardsRepo } from "../guards/guards-repo"
import { MembersRepo } from "../org/members-repo"
import { TeamsRepo } from "../org/teams-repo"
import { Ids } from "../platform/ids"
import { mayDecide, otherApprovers } from "./approval-routing"
import { ApprovalsRepo } from "./approvals-repo"

/** How long an approval request (and a granted, not yet used approval) stays usable. */
const ApprovalWindow = { hours: 24 }

export const requestHash = (request: ApprovalRequest) => Effect.promise(() => sha256Hex(canonicalJson(request)))

export class Approvals extends Context.Service<Approvals, {
  /** Pending requests this principal may decide: routed to the guard's approvers (see `mayDecide`). */
  readonly listPending: (principal: Principal) => Effect.Effect<ReadonlyArray<Approval>, Forbidden>
  readonly decide: (principal: Principal, id: ApprovalId, input: DecideApproval) => Effect.Effect<Approval, Forbidden | NotFound | Conflict>
  /**
   * For this exact action: uses an approved approval once (returned as `consumed`, the call may run),
   * else returns the pending one, else opens a new request.
   */
  readonly request: (principal: Principal, guardId: GuardId, request: ApprovalRequest) => Effect.Effect<Approval>
}>()("api/access/Approvals") {
  static readonly layer = Layer.effect(
    Approvals,
    Effect.gen(function*() {
      const approvals = yield* ApprovalsRepo
      const audit = yield* AuditLog
      const guards = yield* GuardsRepo
      const members = yield* MembersRepo
      const teams = yield* TeamsRepo

      /** Active users holding any approver slot of `guard`. */
      const approverPool = Effect.fn("Approvals.approverPool")(function*(orgId: OrgId, guard: Guard) {
        const active = (yield* members.list(orgId)).filter((member) => member.status === "active")
        const pool = new Set<UserId>()
        for (const approver of guard.approvers) {
          if (approver._tag === "Team") for (const member of yield* teams.members(approver.teamId)) pool.add(member.userId)
          for (const member of active) {
            if (member.userId === null) continue
            if (approver._tag === "Author" && member.userId === guard.createdBy) pool.add(member.userId)
            if (approver._tag === "Role" && member.role === approver.role) pool.add(member.userId)
            if (approver._tag === "User" && member.userId === approver.userId) pool.add(member.userId)
          }
        }
        return [...pool].filter((id) => active.some((member) => member.userId === id))
      })

      const decidable = Effect.fn("Approvals.decidable")(function*(principal: Principal, approval: Approval) {
        if (principal._tag !== "User") return false
        const guard = Option.getOrUndefined(yield* guards.find(principal.orgId, approval.guardId))
        const others = guard === undefined || guard.approvers.length === 0
          ? []
          : otherApprovers(yield* approverPool(principal.orgId, guard), approval.requestedBy)
        return mayDecide(principal, approval, guard, others.length > 0)
      })

      const decide = Effect.fn("Approvals.decide")(function*(principal: Principal, id: ApprovalId, input: DecideApproval) {
        const user = yield* requireUser(principal)
        const notFound = new NotFound({ entity: "approval", id })
        const approval = yield* Effect.mapError(Effect.fromOption(yield* approvals.find(principal.orgId, id)), () => notFound)
        // Separation of duties: nobody approves (or rejects) their own request.
        if (approval.requestedBy.type === "user" && approval.requestedBy.id === user.userId) {
          return yield* new Forbidden({ message: "you cannot decide your own approval request" })
        }
        // Routing: the guard's approvers decide; without approvers, anyone with approvals:decide.
        if (!(yield* decidable(principal, approval))) {
          return yield* new Forbidden({ message: "this request is routed to the rule's approvers" })
        }
        if (!(yield* approvals.decide(principal.orgId, id, input.decision, user.userId, input.comment ?? null))) {
          return yield* new Conflict({ message: "the approval is no longer pending" })
        }
        yield* audit.by(principal, input.decision === "approved" ? "approval.granted" : "approval.rejected", { type: "approval", id }, {
          guardId: approval.guardId,
          requestedBy: approval.requestedBy
        })
        return yield* Effect.mapError(Effect.fromOption(yield* approvals.find(principal.orgId, id)), () => notFound)
      })

      const request = Effect.fn("Approvals.request")(function*(principal: Principal, guardId: GuardId, action: ApprovalRequest) {
        const actor = actorOf(principal)
        const hash = yield* requestHash(action)
        const existing = yield* approvals.forRequest(principal.orgId, actor.id, hash)
        if (Option.isSome(existing)) {
          const found = existing.value
          if (found.status === "pending") return found
          if (yield* approvals.consume(principal.orgId, found.id)) {
            yield* audit.by(principal, "approval.consumed", { type: "approval", id: found.id }, { guardId, resourceId: action.resourceId, tool: action.tool })
            return { ...found, status: "consumed" as const }
          }
          // A concurrent identical call used the approval first: this call needs (or joins) a new request.
          const reopened = yield* approvals.forRequest(principal.orgId, actor.id, hash)
          if (Option.isSome(reopened) && reopened.value.status === "pending") return reopened.value
        }
        const now = yield* DateTime.now
        const approval: Approval = {
          id: yield* Ids.approval,
          orgId: principal.orgId,
          guardId,
          requestedBy: actor,
          request: action,
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          comment: null,
          createdAt: now,
          expiresAt: DateTime.add(now, ApprovalWindow)
        }
        yield* approvals.insert(approval, hash)
        yield* audit.by(principal, "approval.requested", { type: "approval", id: approval.id }, {
          guardId,
          resourceId: action.resourceId,
          tool: action.tool
        })
        return approval
      })

      return Approvals.of({
        listPending: Effect.fn("Approvals.listPending")(function*(principal: Principal) {
          // Service accounts never decide; before approvers existed the list needed approvals:decide, and it still does for them.
          if (principal._tag !== "User") yield* requirePermission(principal, "approvals:decide")
          const pending = yield* approvals.pending(principal.orgId)
          return yield* Effect.filter(pending, (approval) => decidable(principal, approval))
        }),
        decide,
        request
      })
    })
  )
}

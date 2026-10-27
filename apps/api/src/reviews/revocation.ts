import { type AccessReviewId, Conflict, type OrgId, type Principal, type ReviewedAccess, type UserId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { GrantsRepo } from "../access/grants-repo"
import { actorOf } from "../audit/actor"
import { AuditLog } from "../audit/audit-log"
import { MembersRepo } from "../org/members-repo"
import { Offboarding } from "../org/offboarding"

/**
 * Makes a `revoke` attestation take effect: the grant is revoked, or the member goes through the one
 * offboarding path (`deprovisionMember`). Access already gone by then is a no-op, not an error.
 */
export class ReviewRevocation extends Context.Service<ReviewRevocation, {
  /** Refuses revokes that cannot take effect, before the decision is recorded: an org keeps its last owner. */
  readonly check: (orgId: OrgId, access: ReviewedAccess) => Effect.Effect<void, Conflict>
  readonly apply: (principal: Principal, by: UserId, reviewId: AccessReviewId, access: ReviewedAccess) => Effect.Effect<void>
}>()("api/reviews/ReviewRevocation") {
  static readonly layer = Layer.effect(
    ReviewRevocation,
    Effect.gen(function*() {
      const grants = yield* GrantsRepo
      const members = yield* MembersRepo
      const offboarding = yield* Offboarding
      const audit = yield* AuditLog

      const check = Effect.fn("ReviewRevocation.check")(function*(orgId: OrgId, access: ReviewedAccess) {
        if (access._tag !== "Membership") return
        const member = yield* members.find(orgId, access.membershipId)
        if (Option.isNone(member) || member.value.status === "deprovisioned" || member.value.role !== "owner") return
        if ((yield* members.countWithRole(orgId, member.value.role)) <= 1) {
          return yield* new Conflict({ message: "an organization needs at least one owner; appoint another owner first" })
        }
      })

      const apply = Effect.fn("ReviewRevocation.apply")(
        function*(principal: Principal, by: UserId, reviewId: AccessReviewId, access: ReviewedAccess) {
          if (access._tag === "Membership") {
            // NotFound would mean the membership row vanished, which never happens: memberships are kept.
            yield* Effect.orDie(offboarding.deprovisionMember(principal.orgId, access.membershipId, actorOf(principal), "access_review"))
            return
          }
          if (yield* grants.revoke(principal.orgId, access.grantId, by)) {
            yield* audit.by(principal, "grant.revoked", { type: "grant", id: access.grantId }, { reason: "access_review", reviewId })
          }
        }
      )

      return ReviewRevocation.of({ check, apply })
    })
  )
}

import { Forbidden, type OrgId, type Principal } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { TokensRepo } from "../../access/tokens-repo"
import { Principals } from "../../auth/principals"
import { requirePermission, requireUser } from "../../auth/permissions"
import { MembersRepo } from "../../org/members-repo"
import type { VerifyRequester } from "./job"

const gone = (why: string) => new Forbidden({ message: `the admin who started this verify ${why}`, permission: "guards:manage" })

/**
 * The verifying admin as a background stage acts as them: re-resolved from ids at job time (role,
 * permissions and teams as they are now), refused when they left, lost the permission, or the personal
 * token they verified through was revoked or expired. Pin lookups and per-user tool listings run as this principal.
 */
export class VerifyPrincipals extends Context.Service<VerifyPrincipals, {
  readonly requesterOf: (principal: Principal) => Effect.Effect<VerifyRequester, Forbidden>
  readonly resolve: (orgId: OrgId, requester: VerifyRequester) => Effect.Effect<Principal, Forbidden>
}>()("api/guards/VerifyPrincipals") {
  static readonly layer = Layer.effect(
    VerifyPrincipals,
    Effect.gen(function*() {
      const members = yield* MembersRepo
      const tokens = yield* TokensRepo
      const principals = yield* Principals

      const requesterOf = Effect.fn("VerifyPrincipals.requesterOf")(function*(principal: Principal) {
        const user = yield* requireUser(principal)
        return { userId: user.userId, membershipId: user.membershipId, tokenId: user.tokenId, projectId: user.projectId } satisfies VerifyRequester
      })

      const resolve = Effect.fn("VerifyPrincipals.resolve")(function*(orgId: OrgId, requester: VerifyRequester) {
        const member = yield* members.findByUser(orgId, requester.userId)
        // A re-invited person is a new membership: the old run does not carry over to it.
        if (Option.isNone(member) || member.value.id !== requester.membershipId || member.value.status !== "active") return yield* gone("is no longer a member")
        if (requester.tokenId !== null) {
          const token = yield* tokens.find(orgId, requester.tokenId)
          const live = Option.isSome(token) && token.value.revokedAt === null && DateTime.isGreaterThan(token.value.expiresAt, yield* DateTime.now)
          if (!live) return yield* gone("did so with a token that has since been revoked or expired")
        }
        const principal = yield* principals.forMember(orgId, member.value, { tokenId: requester.tokenId, projectId: requester.projectId }).pipe(
          Effect.mapError(() => gone("is no longer a member"))
        )
        yield* requirePermission(principal, "guards:manage").pipe(Effect.mapError(() => gone("can no longer manage rules")))
        return principal
      })

      return VerifyPrincipals.of({ requesterOf, resolve })
    })
  )
}

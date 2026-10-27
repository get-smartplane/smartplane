import { type OrgId, type UserId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { AuditLog } from "../audit/audit-log"
import { InvitationAcceptance } from "../org/invitation-acceptance"
import { MembersRepo } from "../org/members-repo"
import { OrgsRepo } from "../org/orgs-repo"
import { UsersRepo } from "./users-repo"
import type { CodeExchange } from "./workos"

/** Completes an AuthKit sign-in: mirrors the user (JIT), accepts a pending invitation and records the login. */
export class SignIn extends Context.Service<SignIn, {
  /** The org the session is scoped to, if the user is an active member of it. */
  readonly complete: (exchange: CodeExchange) => Effect.Effect<Option.Option<OrgId>>
}>()("api/auth/SignIn") {
  static readonly layer = Layer.effect(
    SignIn,
    Effect.gen(function*() {
      const users = yield* UsersRepo
      const orgs = yield* OrgsRepo
      const members = yield* MembersRepo
      const audit = yield* AuditLog
      const acceptance = yield* InvitationAcceptance

      const joinOrg = Effect.fn("SignIn.joinOrg")(function*(orgId: OrgId, userId: UserId, email: string) {
        const byUser = yield* members.findByUser(orgId, userId)
        const member = Option.isSome(byUser) ? byUser : yield* members.findByEmail(orgId, email)
        if (Option.isNone(member) || member.value.status === "deprovisioned") return false
        // Accepting also applies the teams and grants the invitation was set up with.
        if (member.value.status === "invited") yield* acceptance.accept(orgId, member.value.id, userId, null)
        return true
      })

      return SignIn.of({
        complete: Effect.fn("SignIn.complete")(function*(exchange: CodeExchange) {
          const userId = yield* users.upsert(exchange.user)
          if (exchange.organizationId === undefined) return Option.none()
          const org = yield* orgs.findByWorkosId(exchange.organizationId)
          if (Option.isNone(org) || !(yield* joinOrg(org.value.id, userId, exchange.user.email))) return Option.none()
          yield* audit.record({
            orgId: org.value.id,
            type: "auth.login",
            actor: { type: "user", id: userId },
            target: null,
            data: { method: exchange.authenticationMethod ?? null }
          })
          return Option.some(org.value.id)
        })
      })
    })
  )
}

import {
  type ChangeMemberRole,
  Conflict,
  Forbidden,
  InvalidInput,
  type InviteMember,
  type Member,
  type MembershipId,
  NotFound,
  type Principal,
  type RoleSlug,
  type UpstreamFailure
} from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { actorOf } from "../audit/actor"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { WorkOS } from "../auth/workos"
import { assignableRole } from "./assignable-role"
import { Ids } from "../platform/ids"
import { MembersRepo } from "./members-repo"
import { Offboarding } from "./offboarding"
import { OrgsRepo } from "./orgs-repo"
import { RolesRepo } from "./roles-repo"

export class Members extends Context.Service<Members, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<Member>, Forbidden>
  readonly invite: (principal: Principal, input: InviteMember) => Effect.Effect<Member, Forbidden | Conflict | InvalidInput | UpstreamFailure>
  readonly changeRole: (principal: Principal, id: MembershipId, input: ChangeMemberRole) => Effect.Effect<Member, Forbidden | NotFound | Conflict | InvalidInput>
  readonly remove: (principal: Principal, id: MembershipId) => Effect.Effect<Member, Forbidden | NotFound | Conflict | InvalidInput>
}>()("api/org/Members") {
  static readonly layer = Layer.effect(
    Members,
    Effect.gen(function*() {
      const members = yield* MembersRepo
      const roles = yield* RolesRepo
      const orgs = yield* OrgsRepo
      const workos = yield* WorkOS
      const offboarding = yield* Offboarding
      const audit = yield* AuditLog

      const load = (principal: Principal, id: MembershipId) =>
        members.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "member", id })))

      const assignable = (principal: Principal, role: RoleSlug) => Effect.provideService(assignableRole(principal, role), RolesRepo, roles)

      /** Directory-managed members change only through the directory; an org always keeps an owner. */
      const editable = Effect.fn("Members.editable")(function*(principal: Principal, member: Member) {
        if (member.source === "scim") return yield* new Conflict({ message: "this member is managed by directory sync" })
        if (member.status === "deprovisioned") return yield* new Conflict({ message: "this member has been removed" })
        if (member.role === "owner" && (yield* members.countWithRole(principal.orgId, member.role)) <= 1) {
          return yield* new Conflict({ message: "an organization needs at least one owner" })
        }
      })

      const invite = Effect.fn("Members.invite")(function*(principal: Principal, input: InviteMember) {
        yield* requirePermission(principal, "members:manage")
        yield* assignable(principal, input.role)
        if (Option.isSome(yield* members.findByEmail(principal.orgId, input.email))) {
          return yield* new Conflict({ message: `${input.email} is already a member or invited` })
        }
        const workosOrgId = yield* Effect.orDie(Effect.fromOption(yield* orgs.workosIdOf(principal.orgId)))
        const invitationId = yield* workos.sendInvitation(workosOrgId, input.email)
        const id = yield* Ids.membership
        yield* members.insert({
          id,
          orgId: principal.orgId,
          userId: null,
          email: input.email,
          role: input.role,
          status: "invited",
          source: "manual",
          workosMembershipId: null
        })
        yield* audit.by(principal, "member.invited", { type: "member", id }, { email: input.email, role: input.role, invitationId })
        return yield* load(principal, id).pipe(Effect.orDie)
      })

      const changeRole = Effect.fn("Members.changeRole")(function*(principal: Principal, id: MembershipId, input: ChangeMemberRole) {
        yield* requirePermission(principal, "members:manage")
        const user = yield* requireUser(principal)
        const member = yield* load(principal, id)
        if (member.id === user.membershipId) return yield* new InvalidInput({ message: "you cannot change your own role" })
        yield* assignable(principal, input.role)
        if (member.role !== input.role) yield* editable(principal, member)
        yield* members.setRole(principal.orgId, id, input.role)
        yield* audit.by(principal, "member.role_changed", { type: "member", id }, { from: member.role, to: input.role })
        return yield* load(principal, id)
      })

      const remove = Effect.fn("Members.remove")(function*(principal: Principal, id: MembershipId) {
        yield* requirePermission(principal, "members:manage")
        const user = yield* requireUser(principal)
        const member = yield* load(principal, id)
        if (member.id === user.membershipId) return yield* new InvalidInput({ message: "you cannot remove yourself" })
        yield* editable(principal, member)
        return yield* offboarding.deprovisionMember(principal.orgId, id, actorOf(principal), "removed_by_admin")
      })

      return Members.of({
        list: Effect.fn("Members.list")(function*(principal: Principal) {
          yield* requirePermission(principal, "resources:read")
          return yield* members.list(principal.orgId)
        }),
        invite,
        changeRole,
        remove
      })
    })
  )
}

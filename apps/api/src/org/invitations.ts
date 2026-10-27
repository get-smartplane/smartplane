import {
  Conflict,
  type Forbidden,
  type InvalidInput,
  type InviteAccess,
  type InviteWithAccess,
  type Member,
  type MembershipId,
  NotFound,
  type PendingInvite,
  type Principal,
  type UpstreamFailure
} from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { WorkOS } from "../auth/workos"
import { Ids } from "../platform/ids"
import { conflictOnDuplicate } from "../platform/sql"
import { ResourcesRepo } from "../resources/resources-repo"
import { assignableRole } from "./assignable-role"
import { checkInviteAccess } from "./invite-access-check"
import { inviteAccessColumns, InviteAccessRepo } from "./invite-access-repo"
import { MembersRepo } from "./members-repo"
import { OrgsRepo } from "./orgs-repo"
import { RolesRepo } from "./roles-repo"
import { TeamsRepo } from "./teams-repo"

const isEmpty = (access: InviteAccess) => access.teamIds.length === 0 && access.grants.length === 0

/** What an audit event records about a setup: ids, levels and limits, never values that could be secret. */
const auditAccess = (access: InviteAccess) => ({
  teamIds: access.teamIds,
  grants: access.grants.map((grant) => ({
    resourceId: grant.resourceId,
    action: grant.action,
    conditions: grant.conditions,
    expiresAt: grant.expiresAt === null ? null : DateTime.formatIso(grant.expiresAt)
  }))
})

/** Invitations that carry access: teams to join and grants to receive once the person accepts. */
export class Invitations extends Context.Service<Invitations, {
  readonly inviteWithAccess: (principal: Principal, input: InviteWithAccess) => Effect.Effect<ReadonlyArray<Member>, Forbidden | Conflict | InvalidInput | NotFound | UpstreamFailure>
  readonly listPending: (principal: Principal) => Effect.Effect<ReadonlyArray<PendingInvite>, Forbidden>
  readonly setAccess: (principal: Principal, id: MembershipId, access: InviteAccess) => Effect.Effect<PendingInvite, Forbidden | NotFound | Conflict | InvalidInput>
}>()("api/org/Invitations") {
  static readonly layer = Layer.effect(
    Invitations,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const members = yield* MembersRepo
      const orgs = yield* OrgsRepo
      const pending = yield* InviteAccessRepo
      const workos = yield* WorkOS
      const audit = yield* AuditLog
      const repos = Context.make(RolesRepo, yield* RolesRepo).pipe(
        Context.add(TeamsRepo, yield* TeamsRepo),
        Context.add(ResourcesRepo, yield* ResourcesRepo)
      )
      const loadMember = (principal: Principal, id: MembershipId) =>
        members.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "member", id })))

      const inviteWithAccess = Effect.fn("Invitations.inviteWithAccess")(function*(principal: Principal, input: InviteWithAccess) {
        yield* requirePermission(principal, "members:manage")
        const user = yield* requireUser(principal)
        yield* Effect.provide(assignableRole(principal, input.role), repos)
        yield* Effect.provide(checkInviteAccess(principal, input.access, undefined), repos)
        const taken = yield* Effect.filter(input.emails, (email) => Effect.map(members.findByEmail(principal.orgId, email), Option.isSome))
        if (taken.length > 0) return yield* new Conflict({ message: `already a member or invited: ${taken.join(", ")}` })
        const workosOrgId = yield* Effect.orDie(Effect.fromOption(yield* orgs.workosIdOf(principal.orgId)))

        // Validated as a whole above; each person is then invited and written on their own, membership and
        // access in one batch, so a WorkOS failure part-way never leaves anyone with half a setup.
        const invited: Array<Member> = []
        for (const email of input.emails) {
          const invitationId = yield* workos.sendInvitation(workosOrgId, email)
          const id = yield* Ids.membership
          const createdAt = DateTime.formatIso(yield* DateTime.now)
          const membership = { id, orgId: principal.orgId, userId: null, email, role: input.role, status: "invited", source: "manual", workosMembershipId: null, createdAt }
          const setup = isEmpty(input.access) ? [] : [
            sql`INSERT INTO invitation_access ${sql.insert(yield* inviteAccessColumns(principal.orgId, { membershipId: id, access: input.access, setBy: user.userId, updatedAt: yield* DateTime.now }))}`
          ]
          yield* sql.batch([sql`INSERT INTO memberships ${sql.insert(membership)}`, ...setup]).pipe(conflictOnDuplicate(`${email} is already a member or invited`))
          yield* audit.by(principal, "member.invited", { type: "member", id }, { email, role: input.role, invitationId, access: auditAccess(input.access) })
          invited.push(yield* loadMember(principal, id).pipe(Effect.orDie))
        }
        return invited
      })

      const setAccess = Effect.fn("Invitations.setAccess")(function*(principal: Principal, id: MembershipId, access: InviteAccess) {
        yield* requirePermission(principal, "members:manage")
        const user = yield* requireUser(principal)
        const member = yield* loadMember(principal, id)
        if (member.status !== "invited" || member.source !== "manual") {
          return yield* new Conflict({ message: "only pending invitations carry an access setup" })
        }
        const before = yield* pending.find(principal.orgId, id)
        yield* Effect.provide(checkInviteAccess(principal, access, Option.getOrUndefined(Option.map(before, (invite) => invite.access))), repos)
        const invite: PendingInvite = { membershipId: id, access, setBy: user.userId, updatedAt: yield* DateTime.now }
        const columns = yield* inviteAccessColumns(principal.orgId, invite)
        yield* sql.batch([
          sql`DELETE FROM invitation_access WHERE membership_id = ${id} AND org_id = ${principal.orgId}`,
          ...(isEmpty(access) ? [] : [sql`INSERT INTO invitation_access ${sql.insert(columns)}`])
        ]).pipe(Effect.orDie)
        yield* audit.by(principal, "member.invite_updated", { type: "member", id }, {
          before: Option.match(before, { onNone: () => null, onSome: (invite) => auditAccess(invite.access) }),
          after: auditAccess(access)
        })
        return invite
      })

      return Invitations.of({
        inviteWithAccess,
        listPending: Effect.fn("Invitations.listPending")(function*(principal: Principal) {
          // Planned grants are access-control data, like who else holds a grant.
          yield* requirePermission(principal, "members:manage")
          return yield* pending.list(principal.orgId)
        }),
        setAccess
      })
    })
  )
}

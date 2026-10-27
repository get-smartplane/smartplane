import { type AccessTokenId, type Member, type OrgId, type Principal, type ProjectId, Unauthorized } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { MembersRepo } from "../org/members-repo"
import { OrgsRepo } from "../org/orgs-repo"
import { permissionsOf } from "../org/role-permissions"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { UsersRepo } from "./users-repo"

export type MemberIdentity = Pick<Member, "id" | "userId" | "email" | "role" | "status">

export interface MemberContext {
  readonly tokenId: AccessTokenId | null
  readonly projectId: ProjectId | null
}

/** Resolves who is calling into a `Principal`, re-reading role, permissions and teams on every request. */
export class Principals extends Context.Service<Principals, {
  /** An active member acting directly or through a personal token. */
  readonly forMember: (orgId: OrgId, member: MemberIdentity, context: MemberContext) => Effect.Effect<Principal, Unauthorized>
  /** A dashboard session: the WorkOS user and the org the session is scoped to. */
  readonly forSession: (workosUserId: string, workosOrgId: string | undefined) => Effect.Effect<Principal, Unauthorized>
}>()("api/auth/Principals") {
  static readonly layer = Layer.effect(
    Principals,
    Effect.gen(function*() {
      const teams = yield* TeamsRepo
      const roles = yield* RolesRepo
      const users = yield* UsersRepo
      const orgs = yield* OrgsRepo
      const members = yield* MembersRepo
      const noOrganization = new Unauthorized({ reason: "no_organization" })

      const forMember = Effect.fn("Principals.forMember")(function*(orgId: OrgId, member: MemberIdentity, context: MemberContext) {
        if (member.status !== "active" || member.userId === null) return yield* new Unauthorized({ reason: "deprovisioned" })
        const principal: Principal = {
          _tag: "User",
          orgId,
          userId: member.userId,
          membershipId: member.id,
          email: member.email,
          role: member.role,
          permissions: yield* Effect.provideService(permissionsOf(orgId, member.role), RolesRepo, roles),
          teamIds: yield* teams.teamIdsOf(orgId, member.userId),
          projectId: context.projectId,
          tokenId: context.tokenId
        }
        return principal
      })

      const forSession = Effect.fn("Principals.forSession")(function*(workosUserId: string, workosOrgId: string | undefined) {
        const user = yield* Effect.mapError(Effect.fromOption(yield* users.findByWorkosId(workosUserId)), () =>
          new Unauthorized({ reason: "invalid_credentials" }))
        if (user.status !== "active") return yield* new Unauthorized({ reason: "deprovisioned" })
        if (workosOrgId === undefined) return yield* noOrganization
        const org = yield* Effect.mapError(Effect.fromOption(yield* orgs.findByWorkosId(workosOrgId)), () => noOrganization)
        const member = yield* members.findByUser(org.id, user.id)
        if (Option.isNone(member)) return yield* noOrganization
        return yield* forMember(org.id, member.value, { tokenId: null, projectId: null })
      })

      return Principals.of({ forMember, forSession })
    })
  )
}

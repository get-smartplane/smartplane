import { type GuardApprover, NotFound, type OrgId } from "@pc/domain"
import { Effect, Option } from "effect"
import type { MembersRepo } from "../org/members-repo"
import type { RolesRepo } from "../org/roles-repo"
import type { TeamsRepo } from "../org/teams-repo"
import { builtinRoles } from "../org/builtin-roles"
import type { ResourcesRepo } from "../resources/resources-repo"
import { describeDirectory, type OrgDirectory } from "./compile/directory"

interface Repos {
  readonly resources: ResourcesRepo["Service"]
  readonly teams: TeamsRepo["Service"]
  readonly members: MembersRepo["Service"]
  readonly roles: RolesRepo["Service"]
}

/** What the compiler needs to know about an org: its resources as text, and who could approve. */
export const makeGuardDirectory = ({ resources, teams, members, roles }: Repos) => {
  const directory = Effect.fn("Guards.directory")(function*(orgId: OrgId) {
    const custom = yield* roles.list(orgId)
    return {
      roles: [...builtinRoles, ...custom].map((role) => role.slug),
      teams: (yield* teams.list(orgId)).map((team) => ({ id: team.id, name: team.name })),
      members: (yield* members.list(orgId)).flatMap((member) =>
        member.userId !== null && member.status === "active" ? [{ userId: member.userId, email: member.email, name: member.name }] : []
      )
    } satisfies OrgDirectory
  })

  const compileContext = Effect.fn("Guards.compileContext")(function*(orgId: OrgId) {
    const known = (yield* resources.list(orgId, {})).slice(0, 100)
    const org = yield* directory(orgId)
    const text = [
      `Resources:\n${known.map((r) => `- ${r.config.kind} "${r.name}": ${r.description}`).join("\n") || "none"}`,
      describeDirectory(org)
    ].join("\n\n")
    return { text, directory: org }
  })

  /** Approvers must name a role, team and member of this org; anything else is NotFound. */
  const checkApprovers = Effect.fn("Guards.checkApprovers")(function*(orgId: OrgId, approvers: ReadonlyArray<GuardApprover>) {
    for (const approver of approvers) {
      if (approver._tag === "Role") {
        const known = builtinRoles.some((role) => role.slug === approver.role) || Option.isSome(yield* roles.find(orgId, approver.role))
        if (!known) return yield* new NotFound({ entity: "role", id: approver.role })
      }
      if (approver._tag === "Team" && Option.isNone(yield* teams.find(orgId, approver.teamId))) {
        return yield* new NotFound({ entity: "team", id: approver.teamId })
      }
      if (approver._tag === "User" && Option.isNone(yield* members.findByUser(orgId, approver.userId))) {
        return yield* new NotFound({ entity: "member", id: approver.userId })
      }
    }
  })

  return { directory, compileContext, checkApprovers }
}

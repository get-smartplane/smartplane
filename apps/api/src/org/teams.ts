import {
  Conflict,
  type Forbidden,
  NotFound,
  type Principal,
  type Team,
  type TeamId,
  type TeamMember,
  type UserId
} from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { Ids, slugify } from "../platform/ids"
import { TeamsRepo } from "./teams-repo"

export class Teams extends Context.Service<Teams, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<Team>>
  readonly create: (principal: Principal, name: string) => Effect.Effect<Team, Forbidden | Conflict>
  readonly rename: (principal: Principal, id: TeamId, name: string) => Effect.Effect<Team, Forbidden | NotFound | Conflict>
  readonly remove: (principal: Principal, id: TeamId) => Effect.Effect<void, Forbidden | NotFound>
  readonly members: (principal: Principal, id: TeamId) => Effect.Effect<ReadonlyArray<TeamMember>, NotFound>
  readonly addMember: (principal: Principal, id: TeamId, userId: UserId) => Effect.Effect<TeamMember, Forbidden | NotFound | Conflict>
  readonly removeMember: (principal: Principal, id: TeamId, userId: UserId) => Effect.Effect<void, Forbidden | NotFound | Conflict>
}>()("api/org/Teams") {
  static readonly layer = Layer.effect(
    Teams,
    Effect.gen(function*() {
      const teams = yield* TeamsRepo
      const sql = yield* D1Client.D1Client
      const audit = yield* AuditLog
      const load = (principal: Principal, id: TeamId) =>
        teams.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "team", id })))
      /** Directory-synced teams mirror a WorkOS group; editing them here would be overwritten. */
      const manual = (team: Team) =>
        team.directoryGroupId === null ? Effect.void : Effect.fail(new Conflict({ message: "membership of this team is managed by directory sync" }))

      const create = Effect.fn("Teams.create")(function*(principal: Principal, name: string) {
        yield* requirePermission(principal, "teams:manage")
        const team: Team = {
          id: yield* Ids.team,
          orgId: principal.orgId,
          name,
          slug: slugify(name),
          directoryGroupId: null,
          memberCount: 0,
          createdAt: yield* DateTime.now
        }
        yield* teams.insert(team)
        yield* audit.by(principal, "team.created", { type: "team", id: team.id }, { name })
        return team
      })

      const remove = Effect.fn("Teams.remove")(function*(principal: Principal, id: TeamId) {
        yield* requirePermission(principal, "teams:manage")
        const user = yield* requireUser(principal)
        yield* load(principal, id)
        const now = DateTime.formatIso(yield* DateTime.now)
        // Grants to a deleted team would otherwise come back to life if its id were ever reused.
        yield* sql.batch([
          sql`UPDATE grants SET revoked_at = ${now}, revoked_by = ${user.userId}
               WHERE org_id = ${principal.orgId} AND subject_type = 'team' AND subject_id = ${id} AND revoked_at IS NULL`,
          sql`DELETE FROM team_members WHERE team_id = ${id}`,
          sql`DELETE FROM teams WHERE id = ${id} AND org_id = ${principal.orgId}`
        ]).pipe(Effect.orDie)
        yield* audit.by(principal, "team.deleted", { type: "team", id })
      })

      const addMember = Effect.fn("Teams.addMember")(function*(principal: Principal, id: TeamId, userId: UserId) {
        yield* requirePermission(principal, "teams:manage")
        yield* manual(yield* load(principal, id))
        if (!(yield* teams.addMember(principal.orgId, id, userId))) {
          const existing = (yield* teams.members(id)).some((member) => member.userId === userId)
          return yield* existing ? new Conflict({ message: "already a member of this team" }) : new NotFound({ entity: "member", id: userId })
        }
        yield* audit.by(principal, "team.member_added", { type: "team", id }, { userId })
        const added = (yield* teams.members(id)).find((member) => member.userId === userId)
        return yield* Effect.fromOption(Option.fromUndefinedOr(added)).pipe(Effect.orDie)
      })

      const removeMember = Effect.fn("Teams.removeMember")(function*(principal: Principal, id: TeamId, userId: UserId) {
        yield* requirePermission(principal, "teams:manage")
        yield* manual(yield* load(principal, id))
        if (!(yield* teams.removeMember(id, userId))) return yield* new NotFound({ entity: "member", id: userId })
        yield* audit.by(principal, "team.member_removed", { type: "team", id }, { userId })
      })

      return Teams.of({
        list: (principal) => teams.list(principal.orgId),
        create,
        rename: Effect.fn("Teams.rename")(function*(principal: Principal, id: TeamId, name: string) {
          yield* requirePermission(principal, "teams:manage")
          yield* load(principal, id)
          yield* teams.rename(principal.orgId, id, name, slugify(name))
          yield* audit.by(principal, "team.updated", { type: "team", id }, { name })
          return yield* load(principal, id)
        }),
        remove,
        members: Effect.fn("Teams.members")(function*(principal: Principal, id: TeamId) {
          yield* load(principal, id)
          return yield* teams.members(id)
        }),
        addMember,
        removeMember
      })
    })
  )
}

import { type Conflict, type OrgId, Team, TeamId, TeamMember, type UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { conflictOnDuplicate, decodeFirst, decodeRows } from "../platform/sql"

const TeamRow = Schema.toCodecJson(Team)
const TeamMemberRow = Schema.toCodecJson(TeamMember)
const TeamIdRow = Schema.Struct({ teamId: TeamId })

export class TeamsRepo extends Context.Service<TeamsRepo, {
  readonly list: (orgId: OrgId) => Effect.Effect<ReadonlyArray<Team>>
  readonly find: (orgId: OrgId, id: TeamId) => Effect.Effect<Option.Option<Team>>
  readonly insert: (team: { id: TeamId; orgId: OrgId; name: string; slug: string }) => Effect.Effect<void, Conflict>
  readonly rename: (orgId: OrgId, id: TeamId, name: string, slug: string) => Effect.Effect<void, Conflict>
  readonly members: (teamId: TeamId) => Effect.Effect<ReadonlyArray<TeamMember>>
  /** Inserts only if the user is an active member of the team's org; returns whether a row was added. */
  readonly addMember: (orgId: OrgId, teamId: TeamId, userId: UserId) => Effect.Effect<boolean>
  readonly removeMember: (teamId: TeamId, userId: UserId) => Effect.Effect<boolean>
  readonly teamIdsOf: (orgId: OrgId, userId: UserId) => Effect.Effect<ReadonlyArray<TeamId>>
}>()("api/org/TeamsRepo") {
  static readonly layer = Layer.effect(
    TeamsRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT t.id, t.org_id, t.name, t.slug, t.directory_group_id, t.created_at,
                                (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
                           FROM teams t`
      const changed = (rows: ReadonlyArray<unknown>) => rows.length > 0
      const duplicateTeam = conflictOnDuplicate("a team with this name already exists")

      return TeamsRepo.of({
        list: Effect.fn("TeamsRepo.list")((orgId: OrgId) => decodeRows(TeamRow)(sql`${select} WHERE t.org_id = ${orgId} ORDER BY t.name`)),
        find: Effect.fn("TeamsRepo.find")((orgId: OrgId, id: TeamId) =>
          decodeFirst(TeamRow)(sql`${select} WHERE t.org_id = ${orgId} AND t.id = ${id}`)
        ),
        insert: Effect.fn("TeamsRepo.insert")(function*(team: { id: TeamId; orgId: OrgId; name: string; slug: string }) {
          const createdAt = DateTime.formatIso(yield* DateTime.now)
          // Columns are named explicitly: callers may pass a full `Team`, whose computed fields have no column.
          const { id, orgId, name, slug } = team
          yield* sql`INSERT INTO teams ${sql.insert({ id, orgId, name, slug, directoryGroupId: null, createdAt })}`.pipe(duplicateTeam)
        }),
        rename: Effect.fn("TeamsRepo.rename")((orgId: OrgId, id: TeamId, name: string, slug: string) =>
          sql`UPDATE teams SET name = ${name}, slug = ${slug} WHERE org_id = ${orgId} AND id = ${id}`.pipe(Effect.asVoid, duplicateTeam)
        ),
        members: Effect.fn("TeamsRepo.members")((teamId: TeamId) =>
          decodeRows(TeamMemberRow)(
            sql`SELECT tm.team_id, tm.user_id, u.email, u.name, tm.added_at
                  FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ${teamId} ORDER BY u.email`
          )
        ),
        addMember: Effect.fn("TeamsRepo.addMember")(function*(orgId: OrgId, teamId: TeamId, userId: UserId) {
          const addedAt = DateTime.formatIso(yield* DateTime.now)
          return changed(
            yield* sql`INSERT INTO team_members (team_id, user_id, added_at)
                       SELECT t.id, m.user_id, ${addedAt} FROM teams t JOIN memberships m ON m.org_id = t.org_id
                        WHERE t.id = ${teamId} AND t.org_id = ${orgId} AND m.user_id = ${userId} AND m.status = 'active'
                       ON CONFLICT DO NOTHING RETURNING team_id`.pipe(Effect.orDie)
          )
        }),
        removeMember: Effect.fn("TeamsRepo.removeMember")((teamId: TeamId, userId: UserId) =>
          sql`DELETE FROM team_members WHERE team_id = ${teamId} AND user_id = ${userId} RETURNING team_id`.pipe(
            Effect.map(changed),
            Effect.orDie
          )
        ),
        teamIdsOf: Effect.fn("TeamsRepo.teamIdsOf")((orgId: OrgId, userId: UserId) =>
          decodeRows(TeamIdRow)(
            sql`SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id = tm.team_id
                 WHERE tm.user_id = ${userId} AND t.org_id = ${orgId}`
          ).pipe(Effect.map((rows) => rows.map((row) => row.teamId)))
        )
      })
    })
  )
}

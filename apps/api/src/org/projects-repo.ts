import { type Conflict, type OrgId, Project, type ProjectId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { conflictOnDuplicate, decodeFirst, decodeRows } from "../platform/sql"

const ProjectRow = Schema.toCodecJson(Project)

export class ProjectsRepo extends Context.Service<ProjectsRepo, {
  readonly list: (orgId: OrgId, includeArchived: boolean) => Effect.Effect<ReadonlyArray<Project>>
  readonly find: (orgId: OrgId, id: ProjectId) => Effect.Effect<Option.Option<Project>>
  readonly insert: (project: { id: ProjectId; orgId: OrgId; name: string; slug: string }) => Effect.Effect<void, Conflict>
  readonly update: (orgId: OrgId, id: ProjectId, changes: { name: string; slug: string; archived: boolean }) => Effect.Effect<void, Conflict>
}>()("api/org/ProjectsRepo") {
  static readonly layer = Layer.effect(
    ProjectsRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT id, org_id, name, slug, archived_at, created_at FROM projects`
      const duplicate = conflictOnDuplicate("a project with this name already exists")
      return ProjectsRepo.of({
        list: Effect.fn("ProjectsRepo.list")((orgId: OrgId, includeArchived: boolean) =>
          decodeRows(ProjectRow)(
            sql`${select} WHERE org_id = ${orgId} AND (${includeArchived ? 1 : 0} = 1 OR archived_at IS NULL) ORDER BY name`
          )
        ),
        find: Effect.fn("ProjectsRepo.find")((orgId: OrgId, id: ProjectId) =>
          decodeFirst(ProjectRow)(sql`${select} WHERE org_id = ${orgId} AND id = ${id}`)
        ),
        insert: Effect.fn("ProjectsRepo.insert")(function*(project: { id: ProjectId; orgId: OrgId; name: string; slug: string }) {
          const createdAt = DateTime.formatIso(yield* DateTime.now)
          yield* sql`INSERT INTO projects ${sql.insert({ ...project, archivedAt: null, createdAt })}`.pipe(duplicate)
        }),
        update: Effect.fn("ProjectsRepo.update")(function*(
          orgId: OrgId,
          id: ProjectId,
          changes: { name: string; slug: string; archived: boolean }
        ) {
          const now = DateTime.formatIso(yield* DateTime.now)
          yield* sql`UPDATE projects SET name = ${changes.name}, slug = ${changes.slug},
                            archived_at = CASE WHEN ${changes.archived ? 1 : 0} = 1 THEN COALESCE(archived_at, ${now}) ELSE NULL END
                      WHERE org_id = ${orgId} AND id = ${id}`.pipe(duplicate)
        })
      })
    })
  )
}

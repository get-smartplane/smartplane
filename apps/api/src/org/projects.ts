import { type Conflict, type Forbidden, NotFound, type Principal, type Project, type ProjectId, type UpdateProject } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission } from "../auth/permissions"
import { Ids, slugify } from "../platform/ids"
import { ProjectsRepo } from "./projects-repo"

export class Projects extends Context.Service<Projects, {
  readonly list: (principal: Principal, includeArchived: boolean) => Effect.Effect<ReadonlyArray<Project>>
  readonly create: (principal: Principal, name: string) => Effect.Effect<Project, Forbidden | Conflict>
  readonly update: (principal: Principal, id: ProjectId, input: UpdateProject) => Effect.Effect<Project, Forbidden | NotFound | Conflict>
}>()("api/org/Projects") {
  static readonly layer = Layer.effect(
    Projects,
    Effect.gen(function*() {
      const projects = yield* ProjectsRepo
      const audit = yield* AuditLog
      const load = (principal: Principal, id: ProjectId) =>
        projects.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "project", id })))

      return Projects.of({
        // A project-scoped token only sees its own project.
        list: (principal, includeArchived) =>
          Effect.map(projects.list(principal.orgId, includeArchived), (all) =>
            principal.projectId === null ? all : all.filter((project) => project.id === principal.projectId)),
        create: Effect.fn("Projects.create")(function*(principal: Principal, name: string) {
          yield* requirePermission(principal, "projects:manage")
          const project: Project = {
            id: yield* Ids.project,
            orgId: principal.orgId,
            name,
            slug: slugify(name),
            archivedAt: null,
            createdAt: yield* DateTime.now
          }
          yield* projects.insert(project)
          yield* audit.by(principal, "project.created", { type: "project", id: project.id }, { name })
          return project
        }),
        update: Effect.fn("Projects.update")(function*(principal: Principal, id: ProjectId, input: UpdateProject) {
          yield* requirePermission(principal, "projects:manage")
          const current = yield* load(principal, id)
          const name = input.name ?? current.name
          yield* projects.update(principal.orgId, id, { name, slug: slugify(name), archived: input.archived ?? current.archivedAt !== null })
          yield* audit.by(principal, "project.updated", { type: "project", id }, input)
          return yield* load(principal, id)
        })
      })
    })
  )
}

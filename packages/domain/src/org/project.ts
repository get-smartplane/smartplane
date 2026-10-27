import { Schema } from "effect"
import { OrgId, ProjectId } from "../ids"
import { Name, Slug, Timestamp } from "../primitives"

/** Scopes resources, guards and tokens; a project-scoped token only sees that project. */
export class Project extends Schema.Opaque<Project>()(
  Schema.Struct({
    id: ProjectId,
    orgId: OrgId,
    name: Name,
    slug: Slug,
    archivedAt: Schema.NullOr(Timestamp),
    createdAt: Timestamp
  }).annotate({ identifier: "Project" })
) {}

export const CreateProject = Schema.Struct({ name: Name }).annotate({ identifier: "CreateProject" })
export type CreateProject = typeof CreateProject.Type

export const UpdateProject = Schema.Struct({
  name: Schema.optionalKey(Name),
  archived: Schema.optionalKey(Schema.Boolean)
}).annotate({ identifier: "UpdateProject" })
export type UpdateProject = typeof UpdateProject.Type

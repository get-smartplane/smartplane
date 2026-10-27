import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Conflict, Forbidden, NotFound } from "../errors"
import { ProjectId } from "../ids"
import { CreateProject, Project, UpdateProject } from "../org/project"
import { Authentication } from "./security"

export class ProjectsApi extends HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.get("list", "/", {
      query: { includeArchived: Schema.optionalKey(Schema.Boolean) },
      success: Schema.Array(Project)
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateProject,
      success: Project.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, Conflict]
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: { id: ProjectId },
      payload: UpdateProject,
      success: Project,
      error: [Forbidden, NotFound, Conflict]
    })
  )
  .middleware(Authentication)
  .prefix("/projects")
{}

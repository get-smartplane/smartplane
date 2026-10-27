import { Forbidden, InvalidInput, type Principal, ProjectId } from "@pc/domain"
import { Result, Schema } from "effect"

/** Set by `smartplane` (from `.smartplane/project.json` or `--project`) to see one project's resources. */
export const ProjectHeader = "x-smartplane-project"

const isProjectId = Schema.is(ProjectId)

/**
 * Narrows an unscoped caller to org-wide resources plus one project's, like `projectId` on the delivery
 * endpoint. It never widens: grants still decide everything, and a token already scoped to a project may not
 * name another one.
 */
export const scopeToProject = (principal: Principal, header: string | undefined): Result.Result<Principal, Forbidden | InvalidInput> => {
  const requested = header?.trim()
  if (requested === undefined || requested === "") return Result.succeed(principal)
  if (!isProjectId(requested)) return Result.fail(new InvalidInput({ message: `${ProjectHeader} must be a project id (prj_...)`, field: ProjectHeader }))
  if (principal.projectId !== null && principal.projectId !== requested) {
    return Result.fail(new Forbidden({ message: "this token is scoped to another project" }))
  }
  return Result.succeed({ ...principal, projectId: requested })
}

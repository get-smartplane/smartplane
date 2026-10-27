import { NotFound, type OrgId, type ProjectId, type ResourceId } from "@pc/domain"
import { Effect, Option } from "effect"
import type { ProjectsRepo } from "../org/projects-repo"
import type { ResourcesRepo } from "../resources/resources-repo"

/** A new guard's project and resources must be this org's: `NotFound` names the first that is not. */
export const checkScope = (
  repos: { readonly projects: ProjectsRepo["Service"]; readonly resources: ResourcesRepo["Service"] },
  orgId: OrgId,
  projectId: ProjectId | null,
  resourceIds: ReadonlyArray<ResourceId>
) =>
  Effect.gen(function*() {
    if (projectId !== null && Option.isNone(yield* repos.projects.find(orgId, projectId))) {
      return yield* new NotFound({ entity: "project", id: projectId })
    }
    const found = yield* repos.resources.findMany(orgId, resourceIds)
    const missing = resourceIds.find((id) => !found.some((resource) => resource.id === id))
    if (missing !== undefined) return yield* new NotFound({ entity: "resource", id: missing })
  })

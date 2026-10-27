import { NotFound, type OrgId, type Resource, type ResourceId, type SkillConfig, type SkillVersion } from "@pc/domain"
import { Effect, Option } from "effect"
import { ResourcesRepo } from "../resources/resources-repo"
import { SkillVersionsRepo } from "./storage/versions-repo"

export interface SkillResource {
  readonly resource: Resource
  readonly config: SkillConfig
}

/** A live skill resource of the org; any other id (or kind) is not found. */
export const loadSkill = (orgId: OrgId, id: ResourceId): Effect.Effect<SkillResource, NotFound, ResourcesRepo> =>
  ResourcesRepo.use((repo) => repo.find(orgId, id)).pipe(
    Effect.flatMap((found) =>
      Option.isSome(found) && found.value.config.kind === "skill"
        ? Effect.succeed({ resource: found.value, config: found.value.config })
        : Effect.fail(new NotFound({ entity: "resource", id }))
    )
  )

export const loadVersion = (orgId: OrgId, id: ResourceId, version: number): Effect.Effect<SkillVersion, NotFound, SkillVersionsRepo> =>
  SkillVersionsRepo.use((repo) => repo.find(orgId, id, version)).pipe(
    Effect.flatMap((found) => (Option.isSome(found) ? Effect.succeed(found.value) : Effect.fail(new NotFound({ entity: "resource", id: `${id}@${version}` }))))
  )

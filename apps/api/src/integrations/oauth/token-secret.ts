import { type Resource, type ResourceId, type UserId } from "@pc/domain"
import { DateTime, Effect, Option } from "effect"
import { Ids } from "../../platform/ids"
import { ResourcesRepo } from "../../resources/resources-repo"
import type { OAuthApp } from "./app"

const nameFor = (integration: Resource, suffix = "") => `${integration.name.slice(0, 60)} OAuth token${suffix}`

/**
 * The secret resource holding an integration's tokens: the one it already points at while that secret is
 * live, otherwise a new one, created in the integration's project and owned by whoever connected it.
 */
export const tokenSecretOf = (app: OAuthApp, by: UserId): Effect.Effect<ResourceId, never, ResourcesRepo> =>
  Effect.gen(function*() {
    const repo = yield* ResourcesRepo
    const existing = app.connection.tokenSecretId
    if (existing !== undefined) {
      const found = yield* repo.find(app.resource.orgId, existing)
      if (Option.isSome(found) && found.value.config.kind === "secret") return existing
    }
    const id = yield* Ids.resource
    const secret: Resource = {
      id,
      orgId: app.resource.orgId,
      projectId: app.resource.projectId,
      name: nameFor(app.resource),
      description: `Managed by Smartplane: OAuth tokens for the ${app.resource.name} integration, refreshed automatically.`,
      config: { kind: "secret" },
      createdBy: by,
      createdAt: yield* DateTime.now,
      updatedAt: null
    }
    // A secret with that name may already exist; the id keeps the managed one distinct.
    yield* repo.insert(secret).pipe(Effect.catchTag("Conflict", () => repo.insert({ ...secret, name: nameFor(app.resource, ` (${id.slice(-6)})`) })), Effect.orDie)
    return id
  })

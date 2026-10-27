import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { ResourceToolList } from "../../resources/resource-tools"
import { Resources } from "../../resources/resources"
import { Skills } from "../../skills/skills"

export const ResourcesHandlers = HttpApiBuilder.group(PrimitiveApi, "resources", Effect.fn(function*(handlers) {
  const resources = yield* Resources
  const skills = yield* Skills
  const tools = yield* ResourceToolList
  return handlers
    .handle("list", ({ query }) => CurrentPrincipal.use((principal) => resources.list(principal, query)))
    .handle("get", ({ params }) => CurrentPrincipal.use((principal) => resources.get(principal, params.id)))
    .handle("create", ({ payload }) =>
      CurrentPrincipal.use((principal) => {
        const { config } = payload
        // GitHub and link skills are fetched as they are created, so they never exist without a version.
        return config.kind === "skill" && (config.source === "github" || config.source === "link")
          ? Effect.map(skills.createFrom(principal, { ...payload, description: config.description || payload.description }, config), (created) => created.resource)
          : resources.create(principal, payload)
      }))
    .handle("update", ({ params, payload }) => CurrentPrincipal.use((principal) => resources.update(principal, params.id, payload)))
    .handle("remove", ({ params }) => CurrentPrincipal.use((principal) => resources.remove(principal, params.id)))
    .handle("tools", ({ params }) => CurrentPrincipal.use((principal) => tools.list(principal, params.id)))
    .handle("rotateSecret", ({ params, payload }) => CurrentPrincipal.use((principal) => resources.rotateSecret(principal, params.id, payload)))
}))

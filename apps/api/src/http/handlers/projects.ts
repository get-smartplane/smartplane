import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Projects } from "../../org/projects"

export const ProjectsHandlers = HttpApiBuilder.group(PrimitiveApi, "projects", Effect.fn(function*(handlers) {
  const projects = yield* Projects
  return handlers
    .handle("list", ({ query }) => CurrentPrincipal.use((principal) => projects.list(principal, query.includeArchived ?? false)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => projects.create(principal, payload.name)))
    .handle("update", ({ params, payload }) => CurrentPrincipal.use((principal) => projects.update(principal, params.id, payload)))
}))

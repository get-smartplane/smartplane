import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Roles } from "../../org/roles"

export const RolesHandlers = HttpApiBuilder.group(PrimitiveApi, "roles", Effect.fn(function*(handlers) {
  const roles = yield* Roles
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => roles.list(principal)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => roles.create(principal, payload)))
    .handle("update", ({ params, payload }) => CurrentPrincipal.use((principal) => roles.update(principal, params.slug, payload)))
    .handle("remove", ({ params }) => CurrentPrincipal.use((principal) => roles.remove(principal, params.slug)))
}))

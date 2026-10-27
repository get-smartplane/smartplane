import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Grants } from "../../access/grants"

export const GrantsHandlers = HttpApiBuilder.group(PrimitiveApi, "grants", Effect.fn(function*(handlers) {
  const grants = yield* Grants
  return handlers
    .handle("list", ({ query }) => CurrentPrincipal.use((principal) => grants.list(principal, query)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => grants.create(principal, payload)))
    .handle("revoke", ({ params }) => CurrentPrincipal.use((principal) => grants.revoke(principal, params.id)))
}))

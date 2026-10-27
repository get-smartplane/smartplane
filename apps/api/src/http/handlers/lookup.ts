import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Lookup } from "../../lookup/lookup"

export const LookupHandlers = HttpApiBuilder.group(PrimitiveApi, "lookup", Effect.fn(function*(handlers) {
  const lookup = yield* Lookup
  return handlers.handle("resolve", ({ payload }) => CurrentPrincipal.use((principal) => lookup.resolve(principal, payload.refs)))
}))

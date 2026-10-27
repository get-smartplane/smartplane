import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Tokens } from "../../access/tokens"

export const TokensHandlers = HttpApiBuilder.group(PrimitiveApi, "tokens", Effect.fn(function*(handlers) {
  const tokens = yield* Tokens
  return handlers
    .handle("list", ({ query }) => CurrentPrincipal.use((principal) => tokens.list(principal, query)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => tokens.create(principal, payload)))
    .handle("revoke", ({ params }) => CurrentPrincipal.use((principal) => tokens.revoke(principal, params.id)))
}))

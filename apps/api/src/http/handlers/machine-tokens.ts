import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MachineTokens } from "../../delivery/machine-tokens"

export const MachineTokensHandlers = HttpApiBuilder.group(PrimitiveApi, "machineTokens", Effect.fn(function*(handlers) {
  const tokens = yield* MachineTokens
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => tokens.list(principal)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => tokens.create(principal, payload)))
    .handle("renew", ({ params, payload }) => CurrentPrincipal.use((principal) => tokens.renew(principal, params.id, payload)))
    .handle("revoke", ({ params }) => CurrentPrincipal.use((principal) => tokens.revoke(principal, params.id)))
}))

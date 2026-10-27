import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Approvals } from "../../access/approvals"

export const ApprovalsHandlers = HttpApiBuilder.group(PrimitiveApi, "approvals", Effect.fn(function*(handlers) {
  const approvals = yield* Approvals
  return handlers
    .handle("listPending", () => CurrentPrincipal.use((principal) => approvals.listPending(principal)))
    .handle("decide", ({ params, payload }) => CurrentPrincipal.use((principal) => approvals.decide(principal, params.id, payload)))
}))

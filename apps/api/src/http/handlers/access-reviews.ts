import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AccessReviews } from "../../reviews/access-reviews"

export const AccessReviewsHandlers = HttpApiBuilder.group(PrimitiveApi, "accessReviews", Effect.fn(function*(handlers) {
  const reviews = yield* AccessReviews
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => reviews.list(principal)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => reviews.create(principal, payload)))
    .handle("get", ({ params }) => CurrentPrincipal.use((principal) => reviews.get(principal, params.id)))
    .handle("decide", ({ params, payload }) =>
      CurrentPrincipal.use((principal) => reviews.decide(principal, params.id, params.itemId, payload)))
    .handle("close", ({ params }) => CurrentPrincipal.use((principal) => reviews.close(principal, params.id)))
    .handle("export", ({ params }) => CurrentPrincipal.use((principal) => reviews.export(principal, params.id)))
}))

import { CurrentDeliveryCaller, CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpEffect, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { DeliverySettings } from "../../delivery/delivery-settings"
import { SecretDelivery } from "../../delivery/secret-delivery"

/** Secret values must not be kept by any cache between the API and the process that asked for them. */
const noStore = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.succeed(HttpServerResponse.setHeaders(response, { "cache-control": "no-store", pragma: "no-cache" })))

const retryAfter = (seconds: number) =>
  HttpEffect.appendPreResponseHandler((_request, response) => Effect.succeed(HttpServerResponse.setHeader(response, "retry-after", String(seconds))))

export const SecretDeliveryHandlers = HttpApiBuilder.group(PrimitiveApi, "secretDelivery", Effect.fn(function*(handlers) {
  const delivery = yield* SecretDelivery
  return handlers.handle("deliver", ({ payload }) =>
    Effect.andThen(
      noStore,
      CurrentDeliveryCaller.use((caller) => delivery.deliver(caller, payload)).pipe(
        Effect.tapError((error) => (error._tag === "RateLimited" ? retryAfter(error.retryAfterSeconds) : Effect.void))
      )
    ))
}))

export const ResourceDeliveryHandlers = HttpApiBuilder.group(PrimitiveApi, "resourceDelivery", Effect.fn(function*(handlers) {
  const settings = yield* DeliverySettings
  return handlers.handle("update", ({ params, payload }) => CurrentPrincipal.use((principal) => settings.update(principal, params.id, payload)))
}))

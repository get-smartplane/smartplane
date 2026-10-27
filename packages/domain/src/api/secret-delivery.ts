import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Conflict, Forbidden, InvalidInput, NotFound, RateLimited } from "../errors"
import { ResourceId } from "../ids"
import { DeliveredSecrets, DeliverSecretsRequest, UpdateDelivery } from "../resources/delivery"
import { Resource } from "../resources/resource"
import { Authentication, DeliveryAuthentication } from "./security"

/**
 * The only endpoint that returns secret plaintext, and only for secrets an admin marked `deliverable`.
 * Responses carry `Cache-Control: no-store`; a 429 carries `Retry-After`.
 */
export class SecretDeliveryApi extends HttpApiGroup.make("secretDelivery")
  .add(
    HttpApiEndpoint.post("deliver", "/deliver", {
      payload: DeliverSecretsRequest,
      success: DeliveredSecrets,
      error: [Forbidden, RateLimited, InvalidInput]
    })
  )
  .middleware(DeliveryAuthentication)
  .prefix("/secrets")
{}

/** Delivery settings of a secret (mode and env name) or a variable (env name). Audited as `secret.delivery_changed`. */
export class ResourceDeliveryApi extends HttpApiGroup.make("resourceDelivery")
  .add(
    HttpApiEndpoint.patch("update", "/:id/delivery", {
      params: { id: ResourceId },
      payload: UpdateDelivery,
      success: Resource,
      error: [Forbidden, NotFound, Conflict, InvalidInput]
    })
  )
  .middleware(Authentication)
  .prefix("/resources")
{}

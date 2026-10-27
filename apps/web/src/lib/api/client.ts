import { PrimitiveApi } from "@pc/domain"
import { Context, Layer } from "effect"
import { HttpApiClient } from "effect/http-api"
import { apiOrigin } from "./http"

export type ApiClientShape = HttpApiClient.ForApi<typeof PrimitiveApi>

/** The typed client derived from the `@pc/domain` contract; the only way the dashboard talks to `/api`. */
export class ApiClient extends Context.Service<ApiClient, ApiClientShape>()("@pc/web/ApiClient") {
  static readonly layer = Layer.effect(ApiClient, HttpApiClient.make(PrimitiveApi, { baseUrl: apiOrigin }))
}

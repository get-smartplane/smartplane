import { PrimitiveApi } from "@pc/domain"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { describe, expect, it } from "vitest"
import { toApiError } from "./errors"
import { signInRequired } from "./sign-in-required"

/** `/api/me` as the API answers it when WorkOS is down, or when the session was rejected. */
const meFailing = (status: number, body: unknown) => {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body, { status }))))
  return Effect.runPromise(
    toApiError(Effect.flatMap(HttpApiClient.make(PrimitiveApi, { baseUrl: "https://app.test" }), (api) => api.me.get())).pipe(
      Effect.flip,
      Effect.provide(Layer.succeed(HttpClient.HttpClient, client))
    )
  )
}

describe("an /api/me failure", () => {
  it("a 502 from the sign-in service decodes as UpstreamFailure and does not send the user to sign in", async () => {
    const error = await meFailing(502, { _tag: "UpstreamFailure", upstream: "Sign-in service", message: "We could not check your session right now." })
    expect(error._tag).toBe("UpstreamFailure")
    expect(signInRequired(error)).toBe(false)
  })

  it("a 401 still sends the user to sign in", async () => {
    const error = await meFailing(401, { _tag: "Unauthorized", reason: "expired" })
    expect(error._tag).toBe("Unauthorized")
    expect(signInRequired(error)).toBe(true)
  })
})

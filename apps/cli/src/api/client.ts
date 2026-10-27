import { Effect, Redacted } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { PrimitiveApi } from "@pc/domain"
import { cliVersion } from "../version"
import { currentSession } from "./session"

export type Api = HttpApiClient.ForApi<typeof PrimitiveApi>

/** The typed client derived from the `@pc/domain` contract, authenticated with a `pc_` bearer token. */
export const makeApi = (apiUrl: string, token: Redacted.Redacted<string>) =>
  HttpApiClient.make(PrimitiveApi, {
    baseUrl: apiUrl,
    transformClient: HttpClient.mapRequest((request) =>
      request.pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.setHeader("user-agent", `smartplane-cli/${cliVersion}`)
      )
    )
  })

/** The client for the current profile or SMARTPLANE_TOKEN. */
export const api = Effect.gen(function*() {
  const session = yield* currentSession
  return yield* makeApi(session.apiUrl, session.token)
})

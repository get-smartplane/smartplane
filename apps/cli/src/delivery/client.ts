import { Forbidden, InvalidInput, MachineTokenPrefix, PolicyDenied, RateLimited, Unauthorized } from "@pc/domain"
import { Effect, Option, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/http"
import type { Session } from "../api/session"
import { toFailure } from "../app/describe-error"
import { authFailure, failure, usageFailure } from "../app/failure"
import { cliVersion } from "../version"
import { DeliveredSecrets, DeliverSecretsRequest } from "./schema"

/** Waiting longer than this on a Retry-After is worse than failing and letting the caller decide. */
const maxRetryAfterSeconds = 60

/** `Retry-After` as seconds or an HTTP date; one second when missing or unreadable. */
export const retryAfterSeconds = (header: string | undefined, now = Date.now()): number => {
  if (header === undefined) return 1
  const seconds = /^\d+$/.test(header.trim()) ? Number(header.trim()) : (Date.parse(header) - now) / 1000
  return Number.isFinite(seconds) ? Math.min(Math.max(Math.ceil(seconds), 0), maxRetryAfterSeconds) : 1
}

const ApiError = Schema.Union([Unauthorized, Forbidden, InvalidInput, PolicyDenied, RateLimited])
const decodeApiError = Schema.decodeUnknownOption(Schema.toCodecJson(ApiError))
const decodeResponse = Schema.decodeUnknownEffect(Schema.toCodecJson(DeliveredSecrets))
const encodeRequest = Schema.encodeEffect(Schema.toCodecJson(DeliverSecretsRequest))

const refusal = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function*() {
    const known = decodeApiError(yield* response.json.pipe(Effect.orElseSucceed(() => null)))
    if (response.status === 401) {
      return Option.match(known, {
        onNone: () => authFailure("The token was not accepted."),
        onSome: (error) => (error._tag === "Unauthorized" ? toFailure(error) : authFailure("The token was not accepted."))
      })
    }
    if (Option.isSome(known) && known.value._tag !== "RateLimited") {
      const described = toFailure(known.value)
      return response.status === 400 ? usageFailure(described.message) : described
    }
    if (response.status === 403) return failure("This token may not receive secrets for this request.")
    return failure(`Unexpected HTTP ${response.status} from the delivery endpoint.`)
  })

/** Waits from the header, which edge-generated 429s carry too, else from a RateLimited body. */
const waitFor = (response: HttpClientResponse.HttpClientResponse) =>
  Effect.gen(function*() {
    const header = response.headers["retry-after"]
    if (header !== undefined) return retryAfterSeconds(header)
    const body = decodeApiError(yield* response.json.pipe(Effect.orElseSucceed(() => null)))
    return Option.match(body, {
      onNone: () => retryAfterSeconds(undefined),
      onSome: (error) => (error._tag === "RateLimited" ? retryAfterSeconds(String(error.retryAfterSeconds)) : retryAfterSeconds(undefined))
    })
  })

/**
 * A plain HttpClient rather than the derived HttpApiClient: a 429 from the edge has a Retry-After header but no
 * `RateLimited` body, and the typed client would only report it as an undecodable response. Bodies are still
 * encoded and decoded with the `@pc/domain` schemas.
 */
const post = (session: Session, body: unknown) =>
  HttpClient.HttpClient.use((client) =>
    client.execute(
      HttpClientRequest.post(`${session.apiUrl}/api/secrets/deliver`).pipe(
        HttpClientRequest.bearerToken(session.token),
        HttpClientRequest.setHeader("user-agent", `smartplane-cli/${cliVersion}`),
        HttpClientRequest.bodyJsonUnsafe(body)
      )
    )
  )

/**
 * Fetches values to inject. A 429 is retried once after its Retry-After; a second 429 fails. Nothing is cached:
 * the values exist only in this process's memory, for as long as the command runs.
 */
export const deliver = Effect.fn("Delivery.deliver")(function*(session: Session, request: DeliverSecretsRequest) {
  const body = yield* encodeRequest(request)
  let response = yield* post(session, body)
  if (response.status === 429) {
    yield* Effect.sleep(`${yield* waitFor(response)} seconds`)
    response = yield* post(session, body)
  }
  if (response.status === 429) return yield* failure("Rate limited by Smartplane (HTTP 429).", `Try again in ${yield* waitFor(response)}s.`)
  if (response.status !== 200) return yield* (yield* refusal(response))
  return yield* decodeResponse(yield* response.json)
})

/** Machine tokens (`pcm_`) can call only the delivery endpoint, so nothing else may be looked up with them. */
export const isMachineToken = (session: Session) => Redacted.value(session.token).startsWith(MachineTokenPrefix)

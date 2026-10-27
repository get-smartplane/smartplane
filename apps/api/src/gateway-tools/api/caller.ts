import { accountModeOf, type ApiConfig, type Resource, UpstreamFailure } from "@pc/domain"
import { Context, Duration, Effect, Layer, Redacted, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import type { ToolResult } from "../../mcp/sdk"
import { ConnectionResolver } from "../../connections/resolver"
import type { UpstreamCaller } from "../../mcp/upstream"
import { Secrets } from "../../secrets/secrets"
import type { ResolvedRequest } from "./resolve"
import { formatResponse } from "./response"

/** Upstream API calls must not hold an agent (or a Worker invocation) for long. */
export const RequestTimeout = Duration.seconds(15)
/** Larger bodies are cut; agents rarely benefit from more and Workers memory is finite. */
export const MaxResponseBytes = 1_000_000

const readCapped = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Effect.gen(function*() {
    const chunks: Array<Uint8Array> = []
    let size = 0
    yield* stream.pipe(
      Stream.takeWhile(() => size <= MaxResponseBytes),
      Stream.runForEach((chunk) => Effect.sync(() => void (chunks.push(chunk), size += chunk.length)))
    )
    const bytes = new Uint8Array(size)
    chunks.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.length), 0)
    return { bytes: bytes.slice(0, MaxResponseBytes), truncated: size > MaxResponseBytes }
  })

/** Sends resolved API requests with the resource's credential injected. The credential never reaches the agent. */
export class ApiCaller extends Context.Service<ApiCaller, {
  readonly send: (resource: Resource, config: typeof ApiConfig.Type, caller: UpstreamCaller, request: ResolvedRequest) => Effect.Effect<ToolResult, UpstreamFailure>
}>()("api/gateway-tools/ApiCaller") {
  static readonly layer = Layer.effect(
    ApiCaller,
    Effect.gen(function*() {
      const secrets = yield* Secrets
      const client = yield* HttpClient.HttpClient
      const resolver = yield* ConnectionResolver

      /** The shared secret, or in `per_user` mode the caller's own connected key. */
      const secretOf = (resource: Resource, config: typeof ApiConfig.Type, { principal, actor }: UpstreamCaller) => {
        const missing = () => new UpstreamFailure({ upstream: resource.name, message: "the API's credential is missing" })
        if (accountModeOf(config) === "per_user") {
          return resolver.credential(resource, principal, actor).pipe(
            Effect.mapError(missing),
            Effect.flatMap((stored) => (stored.type === "secret" ? Effect.succeed(Redacted.make(stored.value)) : Effect.fail(missing())))
          )
        }
        return config.authSecretId === undefined ? Effect.succeed(undefined) : secrets.reveal(resource.orgId, config.authSecretId, "upstream_auth", actor).pipe(Effect.mapError(missing))
      }

      const credential = Effect.fn("ApiCaller.credential")(function*(resource: Resource, config: typeof ApiConfig.Type, caller: UpstreamCaller) {
        const secret = yield* secretOf(resource, config, caller)
        if (secret === undefined) return {}
        // Default: `Authorization: Bearer <secret>`; a named header carries the secret verbatim.
        return config.authHeader === undefined
          ? { authorization: `Bearer ${Redacted.value(secret)}` }
          : { [config.authHeader.toLowerCase()]: Redacted.value(secret) }
      })

      const send = Effect.fn("ApiCaller.send")(function*(resource: Resource, config: typeof ApiConfig.Type, caller: UpstreamCaller, request: ResolvedRequest) {
        yield* Effect.annotateCurrentSpan({ "api.resource": resource.id, "http.request.method": request.method, "url.path": request.url.pathname })
        const failure = (message: string) => new UpstreamFailure({ upstream: resource.name, message })
        const headers = { ...request.headers, ...(yield* credential(resource, config, caller)) }
        const base = HttpClientRequest.make(request.method)(request.url, { headers })
        const outgoing = request.body === undefined ? base : HttpClientRequest.bodyJsonUnsafe(base, request.body)
        const response = yield* Effect.gen(function*() {
          const received = yield* client.execute(outgoing)
          // 204s, HEADs and redirects have no body; that is a valid, empty response.
          const body = yield* readCapped(received.stream).pipe(
            Effect.catchIf((error) => error.reason._tag === "EmptyBodyError", () => Effect.succeed({ bytes: new Uint8Array(0), truncated: false }))
          )
          return { status: received.status, headers: received.headers, ...body }
        }).pipe(
          // Redirects are returned, not followed: following one could carry the credential to another host.
          Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
          Effect.mapError((error) => failure(error.message)),
          Effect.timeoutOrElse({ duration: RequestTimeout, orElse: () => Effect.fail(failure("timed out")) })
        )
        yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status, "api.truncated": response.truncated })
        return formatResponse(response)
      })

      return ApiCaller.of({ send })
    })
  )
}

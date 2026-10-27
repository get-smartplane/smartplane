import { InvalidInput, UpstreamFailure } from "@pc/domain"
import { Context, Duration, Effect, Layer, Stream } from "effect"
import { FetchHttpClient, HttpClient, type HttpClientError, HttpClientRequest } from "effect/http"
import { screenUrl } from "./safe-url"

export interface FetchOptions {
  readonly headers?: Readonly<Record<string, string>>
  readonly maxBytes: number
  /** Hosts a redirect may lead to besides the URL's own (e.g. api.github.com → codeload.github.com). */
  readonly redirectHosts?: ReadonlyArray<string>
}

export interface Fetched {
  readonly status: number
  readonly url: URL
  readonly contentType: string | undefined
  readonly bytes: Uint8Array
}

interface Hop {
  readonly status: number
  readonly location: string | undefined
  readonly contentType: string | undefined
  readonly bytes: Uint8Array
}

const Timeout = Duration.seconds(20)
const MaxRedirects = 3
const redirects = new Set([301, 302, 303, 307, 308])

const upstream = (message: string) => new UpstreamFailure({ upstream: "skill-source", message })
const tooLarge = (maxBytes: number) => new InvalidInput({ message: `the download is larger than ${maxBytes} bytes`, field: "url" })

/** Reads at most `maxBytes`; one byte more fails rather than truncating, since a cut archive is useless. */
const readCapped = <E>(stream: Stream.Stream<Uint8Array, E>, maxBytes: number) =>
  Effect.gen(function*() {
    const chunks: Array<Uint8Array> = []
    let size = 0
    yield* stream.pipe(
      Stream.takeWhile(() => size <= maxBytes),
      Stream.runForEach((chunk) => Effect.sync(() => void (chunks.push(chunk), size += chunk.length)))
    )
    if (size > maxBytes) return yield* tooLarge(maxBytes)
    const bytes = new Uint8Array(size)
    chunks.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.length), 0)
    return bytes
  })

/**
 * Downloads skill sources on a user's behalf. Every URL, including each redirect target, passes the SSRF
 * screen; redirects are followed by hand, only to the same host or an allowed one, and headers (which
 * may carry a token) are dropped as soon as the host changes. Bodies are capped and calls time out.
 */
export class SkillFetcher extends Context.Service<SkillFetcher, {
  readonly get: (url: string, options: FetchOptions) => Effect.Effect<Fetched, InvalidInput | UpstreamFailure>
}>()("api/skills/SkillFetcher") {
  static readonly layer = Layer.effect(
    SkillFetcher,
    Effect.gen(function*() {
      const client = yield* HttpClient.HttpClient

      const hop = (url: URL, headers: Readonly<Record<string, string>>, maxBytes: number): Effect.Effect<Hop, InvalidInput | UpstreamFailure> =>
        client.execute(HttpClientRequest.get(url, { headers: { "user-agent": "smartplane-skills", ...headers } })).pipe(
          Effect.flatMap((response): Effect.Effect<Hop, InvalidInput | HttpClientError.HttpClientError> =>
            redirects.has(response.status)
              ? Effect.succeed({ status: response.status, location: response.headers.location, contentType: undefined, bytes: new Uint8Array(0) })
              : Effect.map(readCapped(response.stream, maxBytes), (bytes) => ({
                status: response.status,
                location: undefined,
                contentType: response.headers["content-type"],
                bytes
              }))
          ),
          Effect.mapError((error) => (error._tag === "InvalidInput" ? error : upstream(error.message))),
          Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" })
        )

      const get = Effect.fn("SkillFetcher.get")(function*(raw: string, options: FetchOptions) {
        const first = yield* Effect.fromResult(screenUrl(raw))
        yield* Effect.annotateCurrentSpan({ "url.host": first.hostname })
        const allowed = new Set([first.hostname, ...(options.redirectHosts ?? [])])
        let url = first
        for (let hops = 0; hops <= MaxRedirects; hops++) {
          const headers = url.hostname === first.hostname ? options.headers ?? {} : {}
          const response = yield* hop(url, headers, options.maxBytes)
          if (response.location === undefined) {
            yield* Effect.annotateCurrentSpan({ "http.response.status_code": response.status, "skill.download_bytes": response.bytes.length })
            const fetched: Fetched = { status: response.status, url, contentType: response.contentType, bytes: response.bytes }
            return fetched
          }
          const next = yield* Effect.fromResult(screenUrl(new URL(response.location, url).toString()))
          if (!allowed.has(next.hostname)) return yield* new InvalidInput({ message: `refused a redirect to another host (${next.hostname})`, field: "url" })
          url = next
        }
        return yield* upstream("too many redirects")
      }, (effect) => Effect.timeoutOrElse(effect, { duration: Timeout, orElse: () => Effect.fail(upstream("the download timed out")) }))

      return SkillFetcher.of({ get })
    })
  )
}

import { Effect, Layer } from "effect"
import { HttpBody, HttpClient, HttpClientResponse } from "effect/http"

export interface RecordedRequest {
  readonly method: string
  readonly path: string
  readonly query: Readonly<Record<string, string>>
  readonly authorization: string | undefined
  readonly body: unknown
}

export interface FakeResponse {
  readonly status?: number
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
}

/** `"GET /api/resources"` or `"PATCH /api/resources/:id/delivery"` → a JSON reply (the wire format: ISO timestamps, `_tag`ged errors). */
export type Routes = Readonly<Record<string, FakeResponse | ((request: RecordedRequest) => FakeResponse)>>

const bodyOf = (body: HttpBody.HttpBody): unknown => {
  if (body._tag !== "Uint8Array") return undefined
  const text = new TextDecoder().decode(body.body)
  return text === "" ? undefined : JSON.parse(text)
}

/** A route with `:param` segments, for ids the command under test creates. */
const matching = (routes: Routes, method: string, pathname: string) => {
  const key = Object.keys(routes).find((candidate) => {
    const [routeMethod, pattern] = candidate.split(" ")
    if (routeMethod !== method || pattern === undefined || !pattern.includes(":")) return false
    return new RegExp(`^${pattern.replace(/:[A-Za-z]+/g, "[^/]+")}$`).test(pathname)
  })
  return key === undefined ? undefined : routes[key]
}

/**
 * An in-memory `HttpClient` standing in for the API: the real `HttpApiClient` encodes requests and decodes these
 * replies with the `@pc/domain` schemas, so fixtures that drift from the contract fail the test.
 */
export const fakeApi = (routes: Routes, requests: Array<RecordedRequest> = []) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) => {
      const recorded: RecordedRequest = {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        authorization: request.headers["authorization"],
        body: bodyOf(request.body)
      }
      requests.push(recorded)
      const route = routes[`${request.method} ${url.pathname}`] ?? matching(routes, request.method, url.pathname)
      const reply = route === undefined
        ? { status: 404, body: { _tag: "NotFound", entity: "resource", id: url.pathname } }
        : typeof route === "function" ? route(recorded) : route
      const status = reply.status ?? 200
      const init = { status, headers: { "content-type": "application/json", ...reply.headers } }
      const web = status === 204 || reply.body === undefined ? new Response(null, { status, ...(reply.headers === undefined ? {} : { headers: reply.headers }) }) : new Response(JSON.stringify(reply.body), init)
      return Effect.succeed(HttpClientResponse.fromWeb(request, web))
    })
  )

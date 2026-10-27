import http, { type IncomingHttpHeaders } from "node:http"

/** A request a piece sent to a provider, as the local stand-in received it. */
export interface Received {
  readonly method: string | undefined
  /** The provider's hostname, e.g. `graph.microsoft.com`. */
  readonly host: string
  /** Path and query at the provider. */
  readonly path: string
  readonly headers: IncomingHttpHeaders
  readonly body: string
}

/**
 * Stands in for providers: pieces' `fetch` calls to `hosts` are sent to a local HTTP server instead (as
 * `/<host>/<path>`), recorded, and answered with `respond`'s JSON. Other URLs (and the local server itself)
 * pass through unchanged, so a test can also point a piece at `origin` directly.
 */
export const mockProvider = (hosts: ReadonlyArray<string>, respond: (request: Received) => unknown) => {
  const received: Array<Received> = []
  const nativeFetch = globalThis.fetch
  let origin = ""
  const server = http.createServer((req, res) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      const [, host = "", ...rest] = (req.url ?? "/").split("/")
      const forwarded = hosts.includes(host)
      const request = { method: req.method, host: forwarded ? host : "127.0.0.1", path: forwarded ? `/${rest.join("/")}` : req.url ?? "/", headers: req.headers, body }
      received.push(request)
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify(respond(request)))
    })
  })

  return {
    received,
    last: (): Received | undefined => received.at(-1),
    origin: () => origin,
    start: async () => {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`
      globalThis.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input))
        if (!hosts.includes(url.hostname)) return nativeFetch(input, init)
        return nativeFetch(`${origin}/${url.hostname}${url.pathname}${url.search}`, init)
      }
    },
    stop: () => {
      globalThis.fetch = nativeFetch
      server.close()
    }
  }
}

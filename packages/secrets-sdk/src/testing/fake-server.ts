import { createServer, type IncomingHttpHeaders } from "node:http"
import type { AddressInfo } from "node:net"

export interface SeenRequest {
  readonly method: string
  readonly path: string
  readonly headers: IncomingHttpHeaders
  readonly body: unknown
}

export interface Reply {
  readonly status?: number
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: unknown
}

/** A local stand-in for the delivery endpoint; `reply` decides each answer and can change between calls. */
export const fakeServer = async (reply: (request: SeenRequest, count: number) => Reply) => {
  const requests: Array<SeenRequest> = []
  const server = createServer((req, res) => {
    let text = ""
    req.on("data", (chunk: Buffer) => (text += chunk.toString("utf8")))
    req.on("end", () => {
      const seen = { method: req.method ?? "", path: req.url ?? "", headers: req.headers, body: text === "" ? undefined : JSON.parse(text) }
      requests.push(seen)
      const answer = reply(seen, requests.length)
      res.writeHead(answer.status ?? 200, { "content-type": "application/json", "cache-control": "no-store", ...answer.headers })
      res.end(answer.body === undefined ? "" : JSON.stringify(answer.body))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

export const delivery = (env: Readonly<Record<string, string>>, denied: ReadonlyArray<{ name: string; reason: string }> = []) => ({
  body: {
    env: Object.entries(env).map(([name, value]) => ({ name, value, kind: "secret", version: 1, resourceId: `res_${name}` })),
    denied,
    expiresAt: null
  }
})

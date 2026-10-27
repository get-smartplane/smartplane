import { afterAll, describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { SecurityHeaders, securityHeaders } from "./security-headers"

const routes = Layer.mergeAll(
  HttpRouter.add("GET", "/health", HttpServerResponse.text("ok")),
  HttpRouter.add("GET", "/boom", Effect.die("boom")),
  SecurityHeaders
)
const { handler, dispose } = HttpRouter.toWebHandler(routes, { disableLogger: true })
afterAll(dispose)

describe("API security headers", () => {
  it("are sent on successful, failed and unknown-route responses", async () => {
    for (const path of ["/health", "/boom", "/nowhere"]) {
      const response = await handler(new Request(`https://api.example.com${path}`))
      for (const [name, value] of Object.entries(securityHeaders)) expect(response.headers.get(name), `${path} ${name}`).toBe(value)
    }
  })
})

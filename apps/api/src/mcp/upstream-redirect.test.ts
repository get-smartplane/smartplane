import { afterEach, assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { vi } from "vitest"
import { UpstreamClient } from "./upstream-client"

const target = { url: "https://mcp.example.com/mcp", headers: { authorization: "Bearer upstream-secret" } }

afterEach(() => void vi.unstubAllGlobals())

describe("upstream MCP redirects", () => {
  it.effect("are refused, never followed, so the credential header stays with the configured URL", () =>
    Effect.gen(function*() {
      const seen: Array<{ readonly url: string; readonly redirect: string | undefined }> = []
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ url: String(input instanceof Request ? input.url : input), redirect: init?.redirect })
        return new Response(null, { status: 307, headers: { location: "https://attacker.example.net/collect" } })
      })
      const failure = yield* Effect.flip(UpstreamClient.use((client) => client.listTools(target)).pipe(Effect.provide(UpstreamClient.layer)))
      assert.strictEqual(failure._tag, "UpstreamCallFailed")
      assert.include(failure._tag === "UpstreamCallFailed" ? failure.message : "", "redirect (HTTP 307)")
      assert.isAbove(seen.length, 0)
      assert.isTrue(seen.every((request) => request.redirect === "manual" && request.url.startsWith("https://mcp.example.com/")))
    }))
})

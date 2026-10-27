import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { realPieces, request, run, secretAuth } from "../testing/harness"
import { mockProvider } from "../testing/mock-provider"

/**
 * Real Activepieces packages, unmodified, run through the Worker's own catalog, validator, context
 * builder and output handling. Only the network is local: an HTTP server stands in for the providers.
 */
const provider = mockProvider(["api.github.com"], ({ host, path, body }) =>
  host === "api.github.com" && path.startsWith("/repos/") ? { number: 7, title: "Flaky deploy", state: "open" } : { echoed: JSON.parse(body || "null") })

beforeAll(provider.start)
afterAll(provider.stop)

describe("real pieces through the runner", () => {
  it.effect("piece-http send_request posts JSON to a local server", () =>
    Effect.gen(function*() {
      const result = yield* run(request("http", "send_request", {
        method: "POST",
        url: `${provider.origin()}/hooks/deploy`,
        headers: { "x-run": "smartplane" },
        body_type: "json",
        body: { data: { service: "billing" } }
      }))
      const last = provider.last()
      assert.deepStrictEqual([last?.method, last?.path, last?.headers["x-run"], last?.body], ["POST", "/hooks/deploy", "smartplane", "{\"service\":\"billing\"}"])
      assert.deepInclude(result.output, { status: 200, body: { echoed: { service: "billing" } } })
    }).pipe(Effect.provide(realPieces)))

  it.effect("piece-github get_issue_ai calls the GitHub API with the connection's token", () =>
    Effect.gen(function*() {
      const result = yield* run(request("github", "get_issue_ai", { owner: "acme", repo: "widgets", issue_number: 7 }, secretAuth("ghp_fake_token_123")))
      const last = provider.last()
      assert.deepStrictEqual([last?.method, last?.host, last?.path, last?.headers.authorization], ["GET", "api.github.com", "/repos/acme/widgets/issues/7", "Bearer ghp_fake_token_123"])
      assert.deepStrictEqual(result.output, { number: 7, title: "Flaky deploy", state: "open" })
    }).pipe(Effect.provide(realPieces)))

  it.effect("rejects arguments that do not match the action's catalog schema", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(run(request("github", "get_issue_ai", { owner: "acme", repo: "widgets", issue_number: "seven" })))
      assert.strictEqual(error._tag, "InvalidInput")
    }).pipe(Effect.provide(realPieces)))
})

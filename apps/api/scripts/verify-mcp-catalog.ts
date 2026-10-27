/**
 * Checks every MCP catalog entry (and the rejected candidates) against the live internet with the same
 * discovery code Connect uses: the SSRF screen, RFC 9728 protected-resource metadata, RFC 8414 / OIDC
 * authorization-server metadata, issuer and endpoint checks. Nothing is registered and nobody signs in.
 *
 *   bun apps/api/scripts/verify-mcp-catalog.ts [--json results.json]
 *
 * Exits 1 when a catalog entry marked `oauth-dcr` no longer passes.
 */
import { mcpCatalog } from "@pc/domain"
import { Effect, Layer, Result } from "effect"
import { FetchHttpClient } from "effect/http"
import { writeFileSync } from "node:fs"
import { McpOAuthDiscovery } from "../src/connections/oauth/discovery"
import { AppConfig } from "../src/platform/config"
import { screenUrl } from "../src/skills/fetch/safe-url"
import { testConfig } from "../src/testing/config"
import { candidates } from "./mcp-catalog-candidates"

interface Target {
  readonly slug: string
  readonly url: string
  readonly listed: boolean
  readonly expectedAuth: string
}

interface Outcome {
  readonly slug: string
  readonly url: string
  readonly listed: boolean
  /** Status of an unauthenticated `initialize`, and the RFC 9728 pointer in its WWW-Authenticate challenge. */
  readonly challenge: { readonly status: number | null; readonly resourceMetadata: string | null }
  readonly issuer: string | null
  readonly dcr: boolean
  readonly s256: boolean
  readonly verdict: "oauth-dcr" | "needs-client" | "no-pkce" | "no-metadata" | "no-auth" | "blocked" | "refused-url"
  readonly detail: string
}

const jsonAt = process.argv.indexOf("--json")
const jsonPath = jsonAt >= 0 ? process.argv[jsonAt + 1] : undefined

const targets: ReadonlyArray<Target> = [
  ...mcpCatalog.map((entry) => ({ slug: entry.slug, url: entry.url, listed: true, expectedAuth: entry.auth })),
  ...candidates.map((candidate) => ({ slug: candidate.slug, url: candidate.url, listed: false, expectedAuth: "-" }))
]

/** An unauthenticated MCP `initialize`, as a client's first request: a server that needs auth answers 401. */
const challengeOf = async (url: string) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smartplane-verify", version: "1" } } })
    })
    const header = response.headers.get("www-authenticate") ?? ""
    await response.body?.cancel()
    return { status: response.status, resourceMetadata: /resource_metadata="([^"]+)"/.exec(header)?.[1] ?? null }
  } catch (cause) {
    return { status: null, resourceMetadata: null, error: cause instanceof Error ? cause.message : String(cause) }
  }
}

const verify = (target: Target) =>
  Effect.gen(function*() {
    const screened = screenUrl(target.url)
    const challenge = yield* Effect.promise(() => challengeOf(target.url))
    const base = { slug: target.slug, url: target.url, listed: target.listed, challenge: { status: challenge.status, resourceMetadata: challenge.resourceMetadata } }
    if (Result.isFailure(screened)) return { ...base, issuer: null, dcr: false, s256: false, verdict: "refused-url", detail: screened.failure.message } satisfies Outcome
    if (challenge.status === null) return { ...base, issuer: null, dcr: false, s256: false, verdict: "blocked", detail: "error" in challenge ? String(challenge.error) : "no response" } satisfies Outcome
    const discovered = yield* Effect.result(McpOAuthDiscovery.use((discovery) => discovery.discover(target.url)))
    if (Result.isFailure(discovered)) {
      const noAuth = challenge.status >= 200 && challenge.status < 300
      return { ...base, issuer: null, dcr: false, s256: false, verdict: noAuth ? "no-auth" : "no-metadata", detail: discovered.failure.message } satisfies Outcome
    }
    const { metadata } = discovered.success
    const dcr = metadata.registration_endpoint !== undefined
    const s256 = metadata.code_challenge_methods_supported?.includes("S256") === true
    const verdict = !s256 ? "no-pkce" : dcr ? "oauth-dcr" : "needs-client"
    const stored = mcpCatalog.find((entry) => entry.slug === target.slug)?.verification
    const drift = stored === undefined || (stored.issuer === metadata.issuer && stored.dynamicRegistration === dcr && stored.pkceS256 === s256) ? "" : " (DRIFT: update the entry's verification)"
    const detail = `issuer ${metadata.issuer}; auth methods ${(metadata.token_endpoint_auth_methods_supported ?? ["(default)"]).join(",")}${drift}`
    return { ...base, issuer: metadata.issuer, dcr, s256, verdict, detail } satisfies Outcome
  })

const Live = McpOAuthDiscovery.layer.pipe(
  Layer.provide(Layer.succeed(AppConfig, { ...testConfig, ENVIRONMENT: "production" })),
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch))
)

const program = Effect.gen(function*() {
  const outcomes = yield* Effect.forEach(targets, verify, { concurrency: 6 })
  const day = new Date().toISOString().slice(0, 10)
  console.log(`MCP catalog verification, ${day}\n`)
  console.log(["slug", "listed", "initialize", "verdict", "dcr", "s256", "detail"].join("\t"))
  for (const o of outcomes) {
    console.log([o.slug, o.listed ? "yes" : "no", `${o.challenge.status ?? "-"}${o.challenge.resourceMetadata === null ? "" : " +prm"}`, o.verdict, o.dcr, o.s256, o.detail].join("\t"))
  }
  const broken = outcomes.filter((o) => o.listed && o.verdict !== "oauth-dcr" && mcpCatalog.find((entry) => entry.slug === o.slug)?.auth === "oauth-dcr")
  if (jsonPath !== undefined) writeFileSync(jsonPath, JSON.stringify({ day, outcomes }, null, 2))
  if (broken.length > 0) {
    console.error(`\n${broken.length} catalog entries no longer pass: ${broken.map((o) => o.slug).join(", ")}`)
    process.exitCode = 1
  }
})

Effect.runPromise(program.pipe(Effect.provide(Live)))

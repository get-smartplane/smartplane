import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, findCatalogEntry, type McpServerConfig } from "@pc/domain"
import { Effect, Option, Redacted } from "effect"
import { ConnectionCallback } from "../connections/oauth/callback"
import { ResourcesRepo } from "../resources/resources-repo"
import { catalogServices, fakeCatalogServer, fakeUpstreamTools } from "../testing/catalog-harness"
import { issuer } from "../testing/fake-oauth-server"
import { orgId, otherUserId, userPrincipal } from "../testing/fixtures"
import { seedOrg, seedUser } from "../testing/seed"
import { McpCatalog } from "./mcp-catalog"

const linearUrl = findCatalogEntry("linear")?.url ?? ""
const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const member = userPrincipal({ userId: otherUserId, email: "eve@example.com" })
const stateOf = (url: string) => new URL(url).searchParams.get("state") ?? ""
const connect = (input: Parameters<McpCatalog["Service"]["connect"]>[2], slug = "linear", principal = admin) =>
  McpCatalog.use((catalog) => catalog.connect(principal, slug, input))
const linearItem = McpCatalog.use((catalog) => catalog.list(admin)).pipe(Effect.map((items) => items.find((item) => item.entry.slug === "linear")))
const seed = Effect.andThen(seedOrg, seedUser(otherUserId, "eve@example.com", "mem_testmem02"))
const services = (options: Parameters<typeof fakeCatalogServer>[1] = {}, events: Array<AuditEvent> = []) => {
  const server = fakeCatalogServer(linearUrl, options)
  return { server, layer: catalogServices(server.fetch, events, fakeUpstreamTools([])) }
}

describe("MCP catalog: one-click Connect", () => {
  it.effect("creates an OAuth MCP server and returns the provider's authorize URL, then lists it as connected after the callback", () => {
    const events: Array<AuditEvent> = []
    const { server, layer } = services({ email: "linear-bot@acme.com" }, events)
    return Effect.gen(function*() {
      yield* seed
      assert.deepStrictEqual((yield* linearItem)?.added, [])
      const connected = yield* connect({ accountMode: "shared", returnTo: "integrations" })
      const config: McpServerConfig = { kind: "mcp_server", url: linearUrl, transport: "streamable_http", auth: { type: "oauth" } }
      assert.deepStrictEqual(connected.resource.config, config)
      assert.strictEqual(connected.resource.name, "Linear")
      // Discovery, dynamic registration, then the authorize URL with PKCE and the resource indicator.
      assert.isTrue(server.seen.some((request) => request.url.endsWith("/register")))
      const authorize = new URL(connected.authorizeUrl ?? "")
      assert.strictEqual(`${authorize.origin}${authorize.pathname}`, `${issuer}/authorize`)
      assert.deepStrictEqual(["code_challenge_method", "resource", "client_id"].map((key) => authorize.searchParams.get(key)), ["S256", linearUrl, "dcr-client-1"])
      assert.deepInclude((yield* linearItem)?.added[0], { resourceId: connected.resource.id, status: "not_connected", accountMode: "shared" })
      // The provider sends the browser back; it lands on the Integrations page, not the resource's.
      const landing = yield* ConnectionCallback.use((callback) => callback.complete({ state: stateOf(connected.authorizeUrl ?? ""), code: "code-1" }, Option.some(admin)))
      assert.strictEqual(landing, `https://app.example.com/integrations?resource=${connected.resource.id}&connection=connected`)
      assert.deepInclude((yield* linearItem)?.added[0], { status: "connected", connectedBy: "ada@example.com" })
      // Audited like any resource creation and connection.
      assert.deepInclude(events.find((event) => event.type === "resource.created")?.data, { kind: "mcp_server", name: "Linear" })
      assert.isTrue(events.some((event) => event.type === "connection.connected" && event.target?.id === connected.resource.id))
    }).pipe(Effect.provide(layer))
  })

  it.effect("returns to the setup step when asked, and numbers a second copy's name", () => {
    const { layer } = services()
    return Effect.gen(function*() {
      yield* seed
      yield* connect({ accountMode: "shared" })
      const second = yield* connect({ accountMode: "shared", returnTo: "setup" })
      assert.strictEqual(second.resource.name, "Linear 2")
      const landing = yield* ConnectionCallback.use((callback) => callback.complete({ state: stateOf(second.authorizeUrl ?? ""), code: "c" }, Option.some(admin)))
      assert.strictEqual(landing, `https://app.example.com/setup?step=tool&resource=${second.resource.id}&connection=connected`)
      assert.strictEqual((yield* Effect.flip(connect({ accountMode: "shared", name: "Linear" })))._tag, "Conflict")
    }).pipe(Effect.provide(layer))
  })

  it.effect("per-user: only creates the server; each member signs in on My connections", () => {
    const { server, layer } = services()
    return Effect.gen(function*() {
      yield* seed
      const connected = yield* connect({ accountMode: "per_user" })
      assert.isNull(connected.authorizeUrl)
      assert.deepInclude(connected.resource.config, { accountMode: "per_user", auth: { type: "oauth" } })
      assert.deepStrictEqual(server.seen, [])
      assert.deepInclude((yield* linearItem)?.added[0], { status: "per_user" })
    }).pipe(Effect.provide(layer))
  })

  it.effect("leaves nothing behind when the sign-in cannot start", () => {
    const { layer } = services({ metadata: { registration_endpoint: undefined, code_challenge_methods_supported: ["plain"] } })
    return Effect.gen(function*() {
      yield* seed
      const failure = yield* Effect.flip(connect({ accountMode: "shared" }))
      assert.strictEqual(failure._tag, "UpstreamFailure")
      assert.deepStrictEqual(yield* ResourcesRepo.use((repo) => repo.ofKind(orgId, "mcp_server")), [])
    }).pipe(Effect.provide(layer))
  })

  it.effect("token servers: shared takes the token as an encrypted secret, per-user takes nothing", () => {
    const { layer } = services()
    return Effect.gen(function*() {
      yield* seed
      assert.deepInclude(yield* Effect.flip(connect({ accountMode: "shared" }, "github")), { _tag: "InvalidInput", field: "token" })
      const shared = yield* connect({ accountMode: "shared", token: Redacted.make("ghp_example") }, "github")
      assert.isNull(shared.authorizeUrl)
      const auth = shared.resource.config.kind === "mcp_server" ? shared.resource.config.auth : undefined
      const secret = auth?.type === "secret" && auth.secretId !== undefined ? yield* ResourcesRepo.use((repo) => repo.find(orgId, auth.secretId ?? shared.resource.id)) : Option.none()
      assert.deepInclude(Option.getOrUndefined(secret), { name: "GitHub token", config: { kind: "secret" } })
      assert.notInclude(JSON.stringify(shared), "ghp_example")
      const perUser = yield* connect({ accountMode: "per_user" }, "github")
      assert.deepInclude(perUser.resource.config, { accountMode: "per_user", auth: { type: "secret" } })
    }).pipe(Effect.provide(layer))
  })

  it.effect("permissions: listing needs resources:read, connecting resources:manage; unknown slugs are NotFound", () => {
    const { layer } = services()
    return Effect.gen(function*() {
      yield* seed
      assert.isAbove((yield* McpCatalog.use((catalog) => catalog.list(member))).length, 10)
      const outsider = userPrincipal({ permissions: [] })
      assert.strictEqual((yield* Effect.flip(McpCatalog.use((catalog) => catalog.list(outsider))))._tag, "Forbidden")
      assert.deepInclude(yield* Effect.flip(connect({ accountMode: "shared" }, "linear", member)), { _tag: "Forbidden", permission: "resources:manage" })
      assert.deepInclude(yield* Effect.flip(connect({ accountMode: "shared" }, "not-a-server")), { _tag: "NotFound", entity: "mcp_catalog_entry" })
      // A member does not learn the names of servers they cannot see.
      yield* connect({ accountMode: "shared" })
      const seen = (yield* McpCatalog.use((catalog) => catalog.list(member))).find((item) => item.entry.slug === "linear")
      assert.deepStrictEqual(seen?.added, [])
    }).pipe(Effect.provide(layer))
  })
})

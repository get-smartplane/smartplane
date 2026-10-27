import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, findCatalogEntry } from "@pc/domain"
import { Effect, Layer, Redacted } from "effect"
import { GrantsRepo } from "../access/grants-repo"
import { makeUpstreamMcpProvider } from "../gateway-tools/upstream-mcp"
import { ToolCatalog } from "../mcp/catalog"
import { ToolSearchSettings } from "../mcp/search/mode"
import { McpGateway } from "../mcp/gateway"
import { ToolPipeline } from "../mcp/pipeline"
import { ToolProviders } from "../mcp/provider"
import { catalogServices, fakeCatalogServer, fakeUpstreamTools } from "../testing/catalog-harness"
import { orgId, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { allowAll, fakeGuards, memoryPinChildren } from "../testing/gateway-fakes"
import { seedOrg, seedUser } from "../testing/seed"
import { McpCatalog } from "./mcp-catalog"

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const colleague = userPrincipal({ userId: otherUserId, email: "eve@example.com" })
const tools = [{ name: "create_issue", inputSchema: { type: "object" } }, { name: "search_code", inputSchema: { type: "object" } }]

/** The real gateway over the catalog's services: real grants, resolution and upstream provider; guards allow. */
const world = (events: Array<AuditEvent>) => {
  const server = fakeCatalogServer(findCatalogEntry("github")?.url ?? "")
  return McpGateway.layer.pipe(
    Layer.provide(Layer.mergeAll(ToolCatalog.layer, ToolPipeline.layer.pipe(Layer.provide(memoryPinChildren())), ToolSearchSettings.fixed(null))),
    Layer.provide(Layer.mergeAll(Layer.effect(ToolProviders, Effect.map(makeUpstreamMcpProvider, (provider) => [provider])), fakeGuards(allowAll))),
    Layer.provideMerge(catalogServices(server.fetch, events, fakeUpstreamTools(tools)))
  )
}

describe("connecting a catalog MCP server gives its creator access", () => {
  it.effect("one admin grant on the server (none on its token secret), and the creator's gateway lists its tools at once", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedOrg
      yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
      const connected = yield* McpCatalog.use((catalog) => catalog.connect(admin, "github", { accountMode: "shared", token: Redacted.make("ghp_example") }))
      const auth = connected.resource.config.kind === "mcp_server" ? connected.resource.config.auth : undefined
      const secretId = auth?.type === "secret" ? auth.secretId : undefined
      if (secretId === undefined) return yield* Effect.die("expected a token secret")

      const grants = yield* GrantsRepo.use((repo) => repo.list(orgId, {}))
      assert.deepStrictEqual(grants.map((grant) => [grant.resourceId, grant.subject, grant.action]), [[connected.resource.id, { type: "user", id: userId }, "admin"]])
      const audited = events.filter((event) => event.type === "grant.created")
      assert.deepStrictEqual(audited.map((event) => event.data.reason), ["creator"])

      const listed = (yield* McpGateway.use((gateway) => gateway.listTools(admin))).map((tool) => tool.name)
      assert.includeMembers(listed, ["github__create_issue", "github__search_code"])
      // Nobody else gets anything until someone grants it.
      assert.isFalse((yield* McpGateway.use((gateway) => gateway.listTools(colleague))).some((tool) => tool.name.startsWith("github__")))
    }).pipe(Effect.provide(world(events)))
  })
})

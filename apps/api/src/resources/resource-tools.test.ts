import { assert, describe, it } from "@effect/vitest"
import { type Resource, ResourceId, UserId } from "@pc/domain"
import { DateTime, Effect, Option } from "effect"
import { Connections } from "../connections/connections"
import { ConnectionCallback } from "../connections/oauth/callback"
import { catalogServices, fakeCatalogServer, fakeUpstreamTools } from "../testing/catalog-harness"
import { grantRow, resourceRow } from "../testing/connection-harness"
import { mcpUrl } from "../testing/fake-oauth-server"
import { now, orgId, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { insertRow, seedOrg, seedUser } from "../testing/seed"
import { ResourceToolList } from "./resource-tools"

const server: Resource = {
  id: ResourceId.make("res_linearmcp1"),
  orgId,
  projectId: null,
  name: "Linear",
  description: "",
  config: { kind: "mcp_server", url: mcpUrl, transport: "streamable_http", auth: { type: "oauth" } },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}
const tools = [
  { name: "list_issues", description: "List issues", inputSchema: {}, annotations: { readOnlyHint: true } },
  { name: "create_issue", inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "delete_issue", inputSchema: {}, annotations: { destructiveHint: true } }
]
const malloryId = UserId.make("usr_mallory001")
const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const eve = userPrincipal({ userId: otherUserId, email: "eve@example.com" })
const mallory = userPrincipal({ userId: malloryId, email: "mallory@example.com" })
const browser = userPrincipal({ userId: malloryId, email: "mallory@example.com", permissions: ["resources:read", "resources:browse"] })

const list = (principal: typeof admin, id = server.id) => ResourceToolList.use((service) => service.list(principal, id))
const services = (listed: Array<string> = []) => {
  const fake = fakeCatalogServer(mcpUrl)
  return catalogServices(fake.fetch, [], fakeUpstreamTools(tools, listed))
}
const signIn = Effect.gen(function*() {
  const started = yield* Connections.use((connections) => connections.startOAuth(admin, server.id))
  const state = new URL(started.authorizeUrl).searchParams.get("state") ?? ""
  yield* ConnectionCallback.use((callback) => callback.complete({ state, code: "c" }, Option.some(admin)))
})
const seed = Effect.gen(function*() {
  yield* seedOrg
  yield* seedUser(otherUserId, "eve@example.com", "mem_testmem02")
  yield* seedUser(malloryId, "mallory@example.com", "mem_mallory01")
  yield* resourceRow(server)
  // Eve may use two of the server's tools.
  yield* insertRow("grants", {
    id: "grt_evetools01", orgId, subject: JSON.stringify({ type: "user", id: otherUserId }), subjectType: "user", subjectId: otherUserId,
    resourceId: server.id, action: "use", conditions: JSON.stringify({ tools: ["list_issues", "delete_issue"] }), createdBy: userId, createdAt: DateTime.formatIso(now)
  })
})

describe("GET /resources/:id/tools", () => {
  it.effect("says not connected until the shared account signs in, then lists every tool with its read/write hint", () => {
    const listed: Array<string> = []
    return Effect.gen(function*() {
      yield* seed
      assert.deepStrictEqual(yield* list(admin), { resourceId: server.id, status: "not_connected", tools: [] })
      assert.deepStrictEqual(listed, [])
      yield* signIn
      const result = yield* list(admin)
      assert.strictEqual(result.status, "available")
      assert.deepStrictEqual(result.tools.map((tool) => [tool.name, tool.access]), [["list_issues", "read"], ["create_issue", "write"], ["delete_issue", "destructive"]])
      assert.deepStrictEqual(listed, ["Bearer at-1"])
    }).pipe(Effect.provide(services(listed)))
  })

  it.effect("a member with a grant sees only the tools their grants allow; without one the server is NotFound or Forbidden", () =>
    Effect.gen(function*() {
      yield* seed
      yield* signIn
      assert.deepStrictEqual((yield* list(eve)).tools.map((tool) => tool.name), ["list_issues", "delete_issue"])
      // No grant: the server is invisible, so its tools are too.
      assert.strictEqual((yield* Effect.flip(list(mallory)))._tag, "NotFound")
      // The catalogue view shows the server exists, but listing its tools still uses the shared account.
      assert.strictEqual((yield* Effect.flip(list(browser)))._tag, "Forbidden")
      yield* grantRow("grt_mallory001", server.id, malloryId)
      assert.strictEqual((yield* list(mallory)).tools.length, 3)
    }).pipe(Effect.provide(services())))

  it.effect("refuses resources that are not MCP servers", () =>
    Effect.gen(function*() {
      yield* seed
      const variable: Resource = { ...server, id: ResourceId.make("res_variable01"), name: "REGION", config: { kind: "variable", value: "eu" } }
      yield* resourceRow(variable)
      assert.strictEqual((yield* Effect.flip(list(admin, variable.id)))._tag, "InvalidInput")
    }).pipe(Effect.provide(services())))
})

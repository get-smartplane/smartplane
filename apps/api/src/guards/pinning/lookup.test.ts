import { assert, describe, it } from "@effect/vitest"
import { PieceId, ResourceId } from "@pc/domain"
import { Effect, Layer, Schema } from "effect"
import { IntegrationCatalog } from "../../integrations/catalog"
import { ToolCatalog } from "../../mcp/catalog"
import { GatewayReads, notReadOnly } from "../../mcp/gateway-reads"
import { ToolPipeline } from "../../mcp/pipeline"
import type { GatewayTool } from "../../mcp/provider"
import { McpTool, textResult } from "../../mcp/sdk"
import { WorkersAi } from "../../platform/ai"
import { AppConfig } from "../../platform/config"
import { testConfig } from "../../testing/config"
import { userPrincipal } from "../../testing/fixtures"
import { resourceOf } from "../../testing/gateway-fakes"
import notionTools from "../grounding/curated/notion.json"
import { fromListing } from "../grounding/tool-doc"
import type { TargetTools } from "../grounding/tool-docs"
import { PinLookup } from "./lookup"

const notion = resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })
const linear = resourceOf("res_linear0001", "Linear", { kind: "integration", pieceId: PieceId.make("linear"), connection: { type: "none" } })
const listed = Schema.decodeUnknownSync(Schema.Struct({ tools: Schema.Array(McpTool) }))(notionTools).tools
const gatewayTool = (target: typeof notion, definition: McpTool): GatewayTool => ({
  definition: { ...definition, name: `${target.name.toLowerCase()}__${definition.name}` },
  target,
  operation: definition.name,
  prepare: (args) => Effect.succeed({ arguments: args, execute: Effect.succeed(textResult("{}")) })
})
const byName = (name: string) => listed.find((tool) => tool.name === name)!

describe("notReadOnly", () => {
  it.effect("allows only tools that every source marks read-only", () =>
    Effect.gen(function*() {
      const catalog = yield* IntegrationCatalog
      assert.isUndefined(notReadOnly(gatewayTool(notion, byName("notion-search")), catalog))
      assert.include(notReadOnly(gatewayTool(notion, byName("notion-update-page")), catalog), "destructive")
      assert.include(notReadOnly(gatewayTool(notion, { name: "mystery", inputSchema: {} }), catalog), "unknown")
      // Annotated read-only, but the piece catalog says it writes: refused.
      assert.include(notReadOnly(gatewayTool(linear, { name: "rawGraphqlQuery", inputSchema: {}, annotations: { readOnlyHint: true } }), catalog), "classifies it as write")
      assert.isUndefined(notReadOnly(gatewayTool(linear, { name: "linear_issues_search", inputSchema: {}, annotations: { readOnlyHint: true } }), catalog))
    }).pipe(Effect.provide(IntegrationCatalog.layer)))
})

/** A gateway whose catalog holds Notion's tools; records what the pipeline ran. */
const gateway = (ran: Array<string>, answer = { results: [{ id: "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f", title: "Todo", type: "database", url: "https://www.notion.so/8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f" }] }) =>
  GatewayReads.layer.pipe(Layer.provide(Layer.mergeAll(
    IntegrationCatalog.layer,
    Layer.succeed(ToolCatalog, { forPrincipal: () => Effect.succeed(new Map(listed.map((tool) => [`notion__${tool.name}`, gatewayTool(notion, tool)]))) }),
    Layer.succeed(ToolPipeline, { run: (_principal, tool) => Effect.sync(() => (ran.push(tool.definition.name), textResult(JSON.stringify(answer)))) })
  )))

const picker = (pick: unknown) => Layer.succeed(WorkersAi, { run: () => Effect.succeed({ response: pick }) })
const docs = listed.map((tool) => fromListing(notion, tool))
const sets = (source: TargetTools["source"]): ReadonlyArray<TargetTools> => [{ target: { resource: notion, product: "Notion", matched: "alias", mention: "notion" }, source, tools: docs }]
const lookupWith = (pick: unknown, ran: Array<string>) =>
  PinLookup.layer.pipe(Layer.provide(Layer.mergeAll(gateway(ran), picker(pick), Layer.succeed(AppConfig, testConfig))))
const lookup = (source: TargetTools["source"] = "listing") => PinLookup.use((pins) => pins.lookup(userPrincipal(), "nobody can update todo list in notion", sets(source)))

describe("PinLookup", () => {
  it.effect("runs the picked read-only search through the gateway and offers what it found", () => {
    const ran: Array<string> = []
    return Effect.gen(function*() {
      const found = yield* lookup()
      assert.deepStrictEqual(ran, ["notion__notion-search"])
      assert.strictEqual(found?.status, "found")
      assert.deepStrictEqual(found?.candidates.map((c) => [c.label, c.kind, c.resourceId]), [["Todo", "database", ResourceId.make("res_notion0001")]])
    }).pipe(Effect.provide(lookupWith({ mention: "todo list", tool: "notion__notion-search", arguments: { query: "Todo" } }, ran)))
  })

  it.effect("never runs a tool that is not read-only, whatever the model picks", () => {
    const ran: Array<string> = []
    return Effect.gen(function*() {
      const found = yield* lookup()
      assert.deepStrictEqual(ran, [])
      assert.strictEqual(found?.status, "no_lookup_tool")
    }).pipe(Effect.provide(lookupWith({ mention: "todo list", tool: "notion__notion-update-page", arguments: { page_id: "x" } }, ran)))
  })

  it.effect("says why the rule stays semantic: nothing specific named, or no connection to look with", () => {
    const ran: Array<string> = []
    return Effect.gen(function*() {
      assert.strictEqual((yield* lookup("curated"))?.status, "no_connection")
      assert.deepStrictEqual(ran, [])
    }).pipe(Effect.provide(lookupWith({ mention: "todo list", tool: "notion__notion-search", arguments: { query: "Todo" } }, ran)))
  })

  it.effect("a rule about a whole system is not pinned", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* lookup())?.status, "not_specific")
    }).pipe(Effect.provide(lookupWith({ mention: null, tool: null }, []))))
})

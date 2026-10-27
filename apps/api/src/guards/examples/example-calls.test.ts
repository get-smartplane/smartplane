import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { WorkersAi } from "../../platform/ai"
import { memoryKv, resourceOf } from "../../testing/gateway-fakes"
import type { ToolDoc } from "../grounding/tool-doc"
import { ExampleCalls } from "./example-calls"

const notion = resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })
const wiki = resourceOf("res_wiki00001", "Team wiki", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })

const doc = (resource = notion, inputSchema: unknown = { type: "object", properties: { page_id: { type: "string" } } }): ToolDoc => ({
  resourceId: resource.id,
  product: "Notion",
  origin: "mcp:https://mcp.notion.com/mcp",
  gatewayName: `${resource.name === "Notion" ? "notion" : "team-wiki"}__notion-update-page`,
  name: "notion-update-page",
  title: "Update page",
  description: "Update a Notion page's properties or content.",
  inputSchema,
  access: "destructive"
})

const answer = {
  calls: [
    { tool: "notion-update-page", arguments: { page_id: "1f2e", properties: { Status: "Done" } }, violates: true, note: "mark a to-do done" },
    { tool: "notion-update-page", arguments: { page_id: "9d8c", authorization: "Bearer abc.def", token: "ghp_abcdefghijklmnopqrstuvwxyz" }, violates: false, note: "edit a doc" }
  ]
}

const world = () => {
  let runs = 0
  const ai = Layer.succeed(WorkersAi, { run: () => Effect.sync(() => (runs++, { choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`` } }] })) })
  const layer = Layer.effect(ExampleCalls, ExampleCalls.make("@cf/test/llm")).pipe(Layer.provide(Layer.mergeAll(ai, memoryKv())))
  return { layer, runs: () => runs }
}

const forRule = (rule: string, tools: ReadonlyArray<ToolDoc>) => ExampleCalls.use((examples) => examples.forRule(rule, tools))

describe("ExampleCalls", () => {
  it.effect("generates once per (server, tool, schema hash, rule) and serves the cache after", () => {
    const { layer, runs } = world()
    return Effect.gen(function*() {
      const first = yield* forRule("nobody can update todo list in notion", [doc()])
      assert.strictEqual(runs(), 1)
      assert.deepStrictEqual(first.map((call) => [call.tool, call.resourceId, call.violates]), [
        ["notion__notion-update-page", notion.id, true],
        ["notion__notion-update-page", notion.id, false]
      ])
      // Same server under another resource name: the cached calls are reused and renamed for it.
      const again = yield* forRule("Nobody can  update todo list in Notion", [doc(wiki)])
      assert.strictEqual(runs(), 1)
      assert.deepStrictEqual(again.map((call) => [call.tool, call.resourceId]), [["team-wiki__notion-update-page", wiki.id], ["team-wiki__notion-update-page", wiki.id]])
      // A changed input schema is a new tool; a different rule needs different labels.
      yield* forRule("nobody can update todo list in notion", [doc(notion, { type: "object", properties: { page_id: { type: "string" }, command: { type: "string" } } })])
      assert.strictEqual(runs(), 2)
      yield* forRule("never delete notion pages", [doc()])
      assert.strictEqual(runs(), 3)
    }).pipe(Effect.provide(layer))
  })

  it.effect("never keeps credential-shaped values from the model", () => {
    const { layer } = world()
    return Effect.gen(function*() {
      const calls = yield* forRule("nobody can update todo list in notion", [doc()])
      assert.deepStrictEqual(calls[1]?.arguments, { page_id: "9d8c", authorization: "[redacted]", token: "[redacted]" })
    }).pipe(Effect.provide(layer))
  })

  it.effect("yields no calls, not an error, when generation fails", () => {
    const failing = Layer.effect(ExampleCalls, ExampleCalls.make("@cf/test/llm")).pipe(
      Layer.provide(Layer.mergeAll(Layer.succeed(WorkersAi, { run: () => Effect.succeed({ response: "not json" }) }), memoryKv()))
    )
    return Effect.gen(function*() {
      assert.deepStrictEqual(yield* forRule("nobody can update todo list in notion", [doc()]), [])
    }).pipe(Effect.provide(failing))
  })
})

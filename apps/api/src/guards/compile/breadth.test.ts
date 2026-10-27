import { assert, describe, it } from "@effect/vitest"
import type { GuardTarget } from "@pc/domain"
import { Effect, Layer, Schema } from "effect"
import { McpTool } from "../../mcp/sdk"
import { WorkersAi } from "../../platform/ai"
import { resourceOf } from "../../testing/gateway-fakes"
import { deriveApplies } from "../applies/derive"
import { GuardCompiler } from "../compiler"
import notionTools from "../grounding/curated/notion.json"
import { rankTools } from "../grounding/rank"
import { fromListing, storedToolDoc } from "../grounding/tool-doc"
import { anyToolClause, namesNoSystem, narrowedTo } from "./breadth"
import { evalDirectory, evalOrgContext } from "./eval-set"
import recorded from "./recorded/unnamed-system.json"

const notion = resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })
const tools = Schema.decodeUnknownSync(Schema.Struct({ tools: Schema.Array(McpTool) }))(notionTools).tools.map((tool) => fromListing(notion, tool))
const ranked = rankTools(recorded.rule, tools)
const target = (matched: GuardTarget["matched"]): GuardTarget => ({ resourceId: notion.id, name: "Notion", product: "Notion", matched, mention: "", tools: "curated", toolCount: tools.length })

/** Answers the first draft with `answers[0]`, the correction with `answers[1]`, and records the prompts. */
const scripted = (answers: ReadonlyArray<unknown>) => {
  const prompts: Array<string> = []
  const layer = Layer.succeed(WorkersAi, {
    run: (_model, input) =>
      Effect.sync(() => {
        const messages = input["messages"]
        const last: unknown = Array.isArray(messages) ? messages.at(-1) : undefined
        prompts.push(typeof last === "object" && last !== null && "content" in last && typeof last.content === "string" ? last.content : "")
        return { response: answers[Math.min(prompts.length, answers.length) - 1] }
      })
  })
  return { prompts, compiler: Layer.effect(GuardCompiler, GuardCompiler.make("@cf/test/llm")).pipe(Layer.provide(layer)) }
}

const compileScoped = GuardCompiler.use((compiler) => compiler.compileDraft(recorded.rule, evalOrgContext, evalDirectory, { tools: ranked, unnamedSystem: true }))

describe("a rule that names no system stays broad (onboarding: \"Agents never delete anything.\")", () => {
  it("the recorded miss: the narrow question scored the onboarding sample far below the threshold", () => {
    assert.isBelow(recorded.narrow.probability, 0.7)
    assert.isAtLeast(recorded.broad.probability, 0.7)
  })

  it("reads scoped-only and model-read targets as unnamed, and named ones as named", () => {
    const grounding = (matched: GuardTarget["matched"]) => ({ targets: [target(matched)], unknown: [], tools: [] })
    assert.isTrue(namesNoSystem(grounding("scope")))
    assert.isTrue(namesNoSystem(grounding("model")))
    assert.isFalse(namesNoSystem(grounding("alias")))
    assert.isFalse(namesNoSystem({ targets: [], unknown: [], tools: [] }))
  })

  it("tells the compiler the listed tools are only examples", () => {
    const { compiler, prompts } = scripted([recorded.broad.draft])
    return Effect.gen(function*() {
      yield* compileScoped
      assert.include(prompts[0], "Tools of the system this rule is scoped to")
      assert.include(prompts[0], "The rule names no system")
    }).pipe(Effect.provide(compiler))
  })

  it("sends back a question confined to the scoped product, and keeps the broad correction", () => {
    const { compiler, prompts } = scripted([recorded.narrow.draft, recorded.broad.draft])
    return Effect.gen(function*() {
      const { compiled } = yield* compileScoped
      assert.strictEqual(prompts.length, 2)
      assert.include(prompts[1], "limits it to Notion")
      assert.strictEqual(compiled.instructions, recorded.broad.draft.instructions)
    }).pipe(Effect.provide(compiler))
  })

  it("ends a question that never says so with the any-tool clause", () => {
    const { compiler } = scripted([{ ...recorded.broad.draft, instructions: "Does this call delete something, for example notion__notion-delete-pages?" }])
    return Effect.gen(function*() {
      const { compiled } = yield* compileScoped
      assert.isTrue(compiled.instructions.endsWith(anyToolClause))
    }).pipe(Effect.provide(compiler))
  })

  it("ignores product names inside tool names and products the rule itself names", () => {
    assert.deepStrictEqual(narrowedTo(recorded.rule, recorded.broad.draft.instructions, ["Notion"]), [])
    assert.deepStrictEqual(narrowedTo(recorded.rule, recorded.narrow.draft.instructions, ["Notion"]), ["Notion"])
    assert.deepStrictEqual(narrowedTo("nobody deletes pages in Notion", "Does this call delete a Notion page?", ["Notion"]), [])
  })

  it("derives no tool filter for it: every tool of the scope is checked", () => {
    const applies = deriveApplies({
      rule: recorded.rule,
      compiled: { instructions: "Does this call delete anything?", examples: [], operations: ["delete"], tools: ["notion__notion-delete-pages"], grounding: { targets: [target("scope")], unknown: [], tools: [] } },
      tools: ranked.map(storedToolDoc),
      violating: [],
      directory: evalDirectory
    })
    assert.deepStrictEqual(applies, { resourceIds: [notion.id], operations: "changes" })
  })
})

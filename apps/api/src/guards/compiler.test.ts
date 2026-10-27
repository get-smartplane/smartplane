import { assert, describe, it } from "@effect/vitest"
import { UpstreamFailure } from "@pc/domain"
import { Effect, Layer, Schema } from "effect"
import { McpTool } from "../mcp/sdk"
import { resourceOf } from "../testing/gateway-fakes"
import { WorkersAi } from "../platform/ai"
import { evalDirectory, evalOrgContext, evalSet } from "./compile/eval-set"
import { scoreCase } from "./compile/eval-score"
import recorded from "./compile/recorded/glm-5.3-flash.json"
import { GuardCompiler } from "./compiler"
import notionTools from "./grounding/curated/notion.json"
import { rankTools } from "./grounding/rank"
import { fromListing } from "./grounding/tool-doc"

/** The draft production returned for the Linear rule: template boilerplate, role exceptions, permission in the question. */
const productionDraft = {
  intent: { mode: "enforce", approvers: [] },
  instructions:
    "Does the proposed action create an issue on the Linear integration without the owner's explicit permission, including indirect forms such as moving, renaming, or overwriting existing issues, bulk operations, or wildcard paths, unless the actor has a role of 'owner' or 'admin'?",
  examples: [
    { action: "member creates issue", violates: true },
    { action: "owner updates existing issue", violates: false },
    { action: "admin bulk edits issues", violates: false },
    { action: "auditor views issue", violates: false }
  ]
}

const lastUserMessage = (input: Readonly<Record<string, unknown>>): string => {
  const messages = input["messages"]
  if (!Array.isArray(messages)) return ""
  const last: unknown = messages.at(-1)
  return typeof last === "object" && last !== null && "content" in last && typeof last.content === "string" ? last.content : ""
}

/** A fake Workers AI that answers each rule with `answer(rule, attempt)` and records the prompts it saw. */
const fakeAi = (answer: (prompt: string, attempt: number) => unknown) => {
  const prompts: Array<string> = []
  const layer = Layer.succeed(WorkersAi, {
    run: (_model, input) =>
      Effect.sync(() => {
        const prompt = lastUserMessage(input)
        prompts.push(prompt)
        return answer(prompt, prompts.length)
      })
  })
  return { prompts, compiler: Layer.effect(GuardCompiler, GuardCompiler.make("@cf/test/llm")).pipe(Layer.provide(layer)) }
}

const compile = (rule: string) => GuardCompiler.use((compiler) => compiler.compile(rule, evalOrgContext, evalDirectory))

describe("GuardCompiler eval set (recorded model answers)", () => {
  const drafts = new Map(recorded.drafts.map((entry) => [entry.rule, entry.draft]))
  for (const testCase of evalSet) {
    it.effect(testCase.rule, () => {
      const { compiler } = fakeAi((prompt) => ({ response: JSON.stringify(drafts.get(prompt.split("\n")[1] ?? "")) }))
      return Effect.gen(function*() {
        const failed = scoreCase(testCase, yield* compile(testCase.rule)).filter((check) => !check.pass)
        assert.deepStrictEqual(failed, [])
      }).pipe(Effect.provide(compiler))
    })
  }
})

describe("GuardCompiler", () => {
  it.effect("turns 'without my permission' into approval by the author, whatever the model said", () => {
    const { compiler } = fakeAi(() => ({ response: { ...productionDraft, instructions: "Does this action create an issue in Linear?" } }))
    return Effect.gen(function*() {
      const compiled = yield* compile("nobody creates issues on linear without my permission")
      assert.deepStrictEqual(compiled.suggestion, { mode: "require_approval", approvers: [{ _tag: "Author" }], unresolved: [], cue: "without my permission" })
    }).pipe(Effect.provide(compiler))
  })

  it.effect("retries once with the problems of a contaminated draft, and keeps the better one", () => {
    const fixed = recorded.drafts.find((entry) => entry.rule.includes("linear"))?.draft
    const { compiler, prompts } = fakeAi((_, attempt) => ({ response: attempt === 1 ? productionDraft : fixed }))
    return Effect.gen(function*() {
      const compiled = yield* compile("nobody creates issues on linear without my permission")
      assert.strictEqual(prompts.length, 2)
      assert.include(prompts[1], "copied from a prompt example")
      assert.include(prompts[1], "ask only about the action")
      assert.notInclude(compiled.instructions, "wildcard")
      assert.notInclude(compiled.instructions, "permission")
    }).pipe(Effect.provide(compiler))
  })

  it.effect("accepts OpenAI-style answers from chat-completion models", () => {
    const draft = recorded.drafts[0]?.draft
    const { compiler, prompts } = fakeAi(() => ({ choices: [{ message: { content: JSON.stringify(draft) } }] }))
    return Effect.gen(function*() {
      const compiled = yield* compile("nobody deletes reports from the Q3 folder")
      assert.include(compiled.instructions, "Q3")
      assert.strictEqual(prompts.length, 1)
    }).pipe(Effect.provide(compiler))
  })

  it.effect("fails with UpstreamFailure when the model returns no usable draft", () => {
    const { compiler } = fakeAi(() => ({ response: "{\"instructions\": \"truncat" }))
    return Effect.gen(function*() {
      const error = yield* Effect.flip(compile("nobody deletes reports from the Q3 folder"))
      assert.instanceOf(error, UpstreamFailure)
    }).pipe(Effect.provide(compiler))
  })
})

describe("GuardCompiler grounded in real tools", () => {
  const notion = resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })
  const tools = Schema.decodeUnknownSync(Schema.Struct({ tools: Schema.Array(McpTool) }))(notionTools).tools.map((tool) => fromListing(notion, tool))
  const ranked = rankTools("nobody can update todo list in notion", tools)
  const grounded = {
    intent: { mode: "enforce", approvers: [], cue: "nobody can" },
    tools: ["notion__notion-update-page", "notion__notion-create-pages"],
    instructions: "Does this call change the Todo list in Notion: notion__notion-update-page on a Todo page or row, or notion__notion-create-pages under the Todo data source? Reads and other pages do not count.",
    examples: [
      { tool: "notion__notion-update-page", arguments: { page_id: "1f2e", command: "update_properties", properties: { Status: "Done" } }, action: "mark a to-do done", violates: true },
      { tool: "notion__notion-create-pages", arguments: { parent: { data_source_id: "collection://todo" }, pages: [{ properties: { Task: "Call the bank" } }] }, action: "add a to-do", violates: true },
      { tool: "notion__notion-fetch", arguments: { id: "https://www.notion.so/Todo-list-8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f" }, action: "read the Todo list", violates: false },
      { tool: "notion__notion-update-page", arguments: { page_id: "9d8c", command: "update_content", content_updates: [] }, action: "edit a Docs page", violates: false }
    ]
  }
  const compileGrounded = GuardCompiler.use((compiler) =>
    compiler.compileDraft("nobody can update todo list in notion", evalOrgContext, evalDirectory, { tools: ranked, notes: [] })
  )

  it.effect("shows the compiler the real tool names and argument shapes", () => {
    const { compiler, prompts } = fakeAi(() => ({ response: grounded }))
    return Effect.gen(function*() {
      yield* compileGrounded
      assert.include(prompts[0], "Tools of the systems this rule names")
      assert.include(prompts[0], "- notion__notion-update-page [destructive] \"Update page\"")
      assert.include(prompts[0], "page_id*: string")
      assert.include(prompts[0], "\"update_properties\"")
    }).pipe(Effect.provide(compiler))
  })

  it.effect("keeps example calls as tool + arguments, for the classifier question and the self-test", () => {
    const { compiler } = fakeAi(() => ({ response: grounded }))
    return Effect.gen(function*() {
      const { compiled, calls } = yield* compileGrounded
      assert.strictEqual(compiled.examples[0]?.action, "notion__notion-update-page {\"page_id\":\"1f2e\",\"command\":\"update_properties\",\"properties\":{\"Status\":\"Done\"}} (mark a to-do done)")
      assert.deepStrictEqual(calls.map((call) => [call.tool, call.resourceId, call.violates]), [
        ["notion__notion-update-page", notion.id, true],
        ["notion__notion-create-pages", notion.id, true],
        ["notion__notion-fetch", notion.id, false],
        ["notion__notion-update-page", notion.id, false]
      ])
    }).pipe(Effect.provide(compiler))
  })

  it.effect("retries a draft that invents tool names, names none, or copies the few-shot example", () => {
    const invented = {
      ...grounded,
      tools: ["notion.update_page"],
      instructions: "Does this action close a helpdesk ticket or edit the Todo list in Notion?",
      examples: grounded.examples.map((example) => ({ ...example, tool: "notion.update_page" }))
    }
    const { compiler, prompts } = fakeAi((_, attempt) => ({ response: attempt === 1 ? invented : grounded }))
    return Effect.gen(function*() {
      const { compiled } = yield* compileGrounded
      assert.strictEqual(prompts.length, 2)
      assert.include(prompts[1], "not a listed tool: notion.update_page")
      assert.include(prompts[1], "names none of the listed tools")
      assert.include(prompts[1], "copied from a prompt example: ticket, helpdesk")
      assert.include(compiled.instructions, "notion__notion-update-page")
    }).pipe(Effect.provide(compiler))
  })
})

import { assert, describe, it } from "@effect/vitest"
import { type CompiledGuard, type GuardTarget, ResourceId, type ToolAccess } from "@pc/domain"
import { evalDirectory } from "../compile/eval-set"
import type { StoredToolDoc } from "../grounding/tool-doc"
import { readActors } from "./actors"
import { deriveApplies } from "./derive"
import { readReferences } from "./references"

const notion = ResourceId.make("res_notion0001")
const doc = (name: string, access: ToolAccess): StoredToolDoc => ({
  resourceId: notion, product: "Notion", origin: "mcp:https://mcp.notion.com/mcp", gatewayName: `notion__${name}`, name, description: name, inputSchema: {}, access
})
const tools = [doc("notion-update-page", "destructive"), doc("notion-create-pages", "write"), doc("notion-delete-pages", "destructive"), doc("notion-fetch", "read"), doc("notion-search", "read")]
const target = (matched: GuardTarget["matched"]): GuardTarget => ({ resourceId: notion, name: "Notion", product: "Notion", matched, mention: "notion", tools: "curated", toolCount: 5 })
const compiled = (overrides: Partial<CompiledGuard> = {}): CompiledGuard => ({
  instructions: "Does this call change the Notion to-do list?",
  examples: [],
  operations: ["create", "update", "delete"],
  tools: ["notion__notion-update-page"],
  grounding: { targets: [target("alias")], unknown: [], tools: tools.map((t) => t.gatewayName) },
  ...overrides
})
const derive = (rule: string, overrides: Partial<CompiledGuard> = {}, violating: ReadonlyArray<string> = []) =>
  deriveApplies({ rule, compiled: compiled(overrides), tools, violating: violating.map((tool) => ({ tool, resourceId: notion, arguments: {}, violates: true })), directory: evalDirectory })

describe("deriveApplies", () => {
  it("a rule about Notion changes: Notion, the tools it names, tools that change things", () => {
    const applies = derive("nobody can update todo list in notion", {}, ["notion__notion-create-pages"])
    assert.deepStrictEqual(applies, {
      resourceIds: [notion],
      tools: [{ resourceId: notion, only: ["notion-update-page", "notion-create-pages"], known: tools.map((t) => t.name) }],
      operations: "changes"
    })
  })

  it("a rule about anything keeps no filter, nor does one whose systems a model guessed", () => {
    assert.isUndefined(derive("never send customer data outside the company", { grounding: { targets: [], unknown: [], tools: [] } }))
    assert.isUndefined(derive("never leak the roadmap", { grounding: { targets: [target("model")], unknown: [], tools: [] } }))
  })

  it("keeps reads in when the rule governs reads or a call that breaks it is a read", () => {
    assert.isUndefined(derive("nobody reads the salary page in notion", { operations: ["read"] })?.operations)
    assert.isUndefined(derive("nobody can update todo list in notion", {}, ["notion__notion-fetch"])?.operations)
    assert.isUndefined(derive("nobody can update todo list in notion", { operations: undefined })?.operations)
  })

  it("no tool list when the draft named none, or named every tool verify saw", () => {
    assert.isUndefined(derive("nobody can update todo list in notion", { tools: undefined })?.tools)
    assert.isUndefined(derive("nobody can update todo list in notion", { tools: tools.map((t) => t.gatewayName) })?.tools)
  })
})

describe("readActors", () => {
  const team = (name: string) => evalDirectory.teams.find((t) => t.name === name)!.id
  it("“contractors can't push” is about contractors only", () => {
    assert.deepStrictEqual(readActors("Contractors can't push to main on GitHub", evalDirectory), { kind: "only", refs: [{ _tag: "Team", teamId: team("Contractors") }] })
  })
  it("“only finance can send” checks everyone except finance", () => {
    assert.deepStrictEqual(readActors("only finance can send invoices from Stripe", evalDirectory), { kind: "except", refs: [{ _tag: "Team", teamId: team("Finance") }] })
    assert.deepStrictEqual(readActors("Nobody except Finance or Security may delete reports", evalDirectory)?.refs.length, 2)
  })
  it("anything ambiguous gives no filter", () => {
    for (const rule of [
      "nobody can update todo list in notion",
      "agents must not delete pages",
      "Finance can't be emailed by agents",
      "contractors can't receive payouts",
      "contractors can't push unless security approved it",
      "interns can't push to main",
      "Contractors can't push. Finance can't merge."
    ]) assert.isUndefined(readActors(rule, evalDirectory), rule)
  })
})

describe("readReferences", () => {
  it("names people by email, name or first name, and accounts by address", () => {
    assert.deepStrictEqual(readReferences("nobody can update todo list in notion", evalDirectory), { people: false, accounts: [] })
    assert.isTrue(readReferences("nobody edits the roadmap without dana's approval", evalDirectory).people)
    assert.isTrue(readReferences("ian@acme.com must not delete pages", evalDirectory).people)
    assert.deepStrictEqual(readReferences("nobody except finance sends from the shared billing@ Gmail", evalDirectory), { people: false, accounts: ["billing@"] })
  })
})

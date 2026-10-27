import { assert, describe, it } from "@effect/vitest"
import { GuardId, ResourceId, UserId } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { Approvals } from "../../access/approvals"
import { textResult } from "../../mcp/sdk"
import { fakeTeams } from "../../testing/connection-fakes"
import { now, orgId, userId, userPrincipal } from "../../testing/fixtures"
import { memoryPinChildren, resourceOf } from "../../testing/gateway-fakes"
import { Classifier } from "../classifier"
import { classifierState } from "../classifier-state"
import { GuardEvaluator } from "../evaluator"
import { GuardsRepo } from "../guards-repo"
import { PinChildren } from "./children-store"
import { harvestResult } from "./harvest-step"

const notion = { ...resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" }), orgId }
const todo = "8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f"
const row = "1f2e8a4b9c3d4e5f8a7b6c5d4e3f2a1b"
const pin = { id: "pin_todo0001", resourceId: ResourceId.make("res_notion0001"), entityId: todo, label: "Todo", kind: "database", pinnedBy: UserId.make("usr_founder01"), pinnedAt: now }
const guard = {
  id: GuardId.make("grd_todolist01"), orgId, projectId: null, resourceIds: [], name: "todo", nameFollowsRule: false, modeFollowsRule: false, applies: null, approvers: [],
  rule: "nobody can update todo list in notion", mode: "enforce" as const, threshold: 0.5, status: "active" as const,
  compiled: { instructions: "Does this call change the Notion to-do list?", examples: [] }, compiledVersion: 1, testCalls: [], pins: [pin], verify: null,
  createdBy: userId, createdAt: now, updatedAt: null
}

const world = (children: Map<string, ReadonlyArray<string>>) => {
  const asked: Array<{ readonly state: unknown; readonly question: string }> = []
  const layer = GuardEvaluator.layer.pipe(
    Layer.provideMerge(memoryPinChildren(children)),
    Layer.provide(fakeTeams([])),
    Layer.provide(Layer.succeed(GuardsRepo, { list: () => Effect.succeed([]), active: () => Effect.succeed([guard]), find: () => Effect.succeed(Option.none()), insert: () => Effect.void, save: () => Effect.void, setRun: () => Effect.succeed(false), saveForRun: () => Effect.succeed(false) })),
    Layer.provide(Layer.succeed(Classifier, { classify: (state, questions) => Effect.sync(() => (asked.push({ state, question: [...questions.values()][0] ?? "" }), new Map([...questions.keys()].map((id) => [id, 0.2])))) })),
    Layer.provide(Layer.succeed(Approvals, { listPending: () => Effect.die("unused"), decide: () => Effect.die("unused"), request: () => Effect.die("unused") }))
  )
  return { asked, layer }
}

const evaluate = (args: unknown) => GuardEvaluator.use((evaluator) => evaluator.evaluate(userPrincipal(), { resource: notion, tool: "notion-update-page", arguments: args }))

describe("pinned context at call time", () => {
  it.effect("a read of the pinned database is harvested; an id-only update to one of its rows then names Todo to the classifier", () => {
    const children = new Map<string, ReadonlyArray<string>>()
    const { asked, layer } = world(children)
    return Effect.gen(function*() {
      // The agent reads the Todo database: its rows are recorded, ids only.
      const read = yield* GuardEvaluator.use((evaluator) => evaluator.evaluate(userPrincipal(), { resource: notion, tool: "notion-query-data-sources", arguments: { data_source_url: `collection://${todo}` } }))
      const listing = textResult(JSON.stringify({ results: [{ url: `https://www.notion.so/${row}`, Task: "Renew passport" }] }))
      yield* harvestResult(yield* PinChildren, orgId, read.pins!, listing)
      assert.deepStrictEqual(children.get("pin_todo0001"), [row])
      assert.notInclude(JSON.stringify([...children.values()]), "Renew passport")

      // Then an update that names the row only by its dashed id.
      const dashed = `${row.slice(0, 8)}-${row.slice(8, 12)}-${row.slice(12, 16)}-${row.slice(16, 20)}-${row.slice(20)}`
      const update = yield* evaluate({ page_id: dashed, properties: { Done: "__YES__" } })
      const last = asked.at(-1)!
      const state = last.state as { readonly touchesNamed?: unknown; readonly target?: string }
      assert.deepStrictEqual(state.touchesNamed, [{ label: "Todo", kind: "Notion database", via: "child" }])
      assert.strictEqual(state.target, "an item recognised inside Todo (Notion database), which a rule names")
      assert.include(last.question, "Context: an id in this call matches an item recognised inside Todo (Notion database), which the rule names.")
      assert.strictEqual(update.decision._tag, "Allow")
    }).pipe(Effect.provide(layer))
  })

  it.effect("a call touching nothing pinned says so, and carries no pinned state", () => {
    const { asked, layer } = world(new Map([["pin_todo0001", [row]]]))
    return Effect.gen(function*() {
      yield* evaluate({ page_id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", command: "update_content" })
      assert.notProperty(asked[0]?.state as object, "touchesNamed")
      assert.include((asked[0]?.state as { readonly target?: string }).target ?? "", "nothing a rule names")
      assert.include(asked[0]?.question ?? "", "Context: no id in this call matches Todo (Notion database), which the rule names, or any item recognised inside it.")
    }).pipe(Effect.provide(layer))
  })
})

describe("classifierState with pins", () => {
  it("carries labels, kinds and one sentence about what the call touches, never ids", () => {
    const state = classifierState({ actor: {}, resource: notion, tool: "x", arguments: { page_id: row }, connection: null, pinned: { touches: [{ label: "Todo", kind: "database", via: "self" }], target: "Todo (Notion database), which a rule names" } })
    assert.deepStrictEqual(state.touchesNamed, [{ label: "Todo", kind: "database", via: "self" }])
    assert.strictEqual(state.target, "Todo (Notion database), which a rule names")
    assert.notInclude(JSON.stringify([state.touchesNamed, state.target]), row)
    assert.notProperty(classifierState({ actor: {}, resource: notion, tool: "x", arguments: {}, connection: null }), "target")
  })
})

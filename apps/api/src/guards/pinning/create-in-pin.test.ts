import { assert, describe, it } from "@effect/vitest"
import { type Guard, GuardId, type GuardOperation, ResourceId, UserId } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { Approvals } from "../../access/approvals"
import { fakeTeams } from "../../testing/connection-fakes"
import { now, orgId, userId, userPrincipal } from "../../testing/fixtures"
import { memoryPinChildren, resourceOf } from "../../testing/gateway-fakes"
import { Classifier } from "../classifier"
import { GuardEvaluator } from "../evaluator"
import { GuardsRepo } from "../guards-repo"
import { type CreateCall, createsInPin } from "./create-in-pin"
import type { ScannedPin } from "./scan"

const todo = "8c1d2e3f4a5b4c7d8e9f0a1b2c3d4e5f"
const todoSource = "5a6b7c8d1e2f4a3b9c8d7e6f5a4b3c2d"
const row = "1f2e8a4b9c3d4e5f8a7b6c5d4e3f2a1b"
const other = "6b7c8d9e2f3a4b4c8d9e8f7a6b5c4d3e"
const dashed = (id: string) => `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
const pin: ScannedPin = { pinId: "pin_todo0001", label: "Todo", kind: "Notion database", entityId: dashed(todo), children: new Set([todoSource, row]) }

const all: ReadonlyArray<GuardOperation> = ["create", "update", "delete"]
const call = (overrides: Partial<CreateCall> = {}): CreateCall => ({
  tool: "notion-create-pages",
  access: "write",
  arguments: { parent: { data_source_id: dashed(todoSource) }, pages: [{ properties: { Task: "Water plants" } }] },
  operations: all,
  ...overrides
})

describe("createsInPin", () => {
  it("is certain when a create's destination is the pin itself or its data source", () => {
    assert.strictEqual(createsInPin(call(), [pin])?.pinId, "pin_todo0001")
    assert.strictEqual(createsInPin(call({ arguments: { parent: { database_id: todo } } }), [pin])?.pinId, "pin_todo0001")
    assert.strictEqual(createsInPin(call({ arguments: { data_source_url: `collection://${dashed(todoSource)}` } }), [pin])?.pinId, "pin_todo0001")
    assert.strictEqual(createsInPin(call({ tool: "add_row", access: "destructive", arguments: { parent_id: dashed(todo), values: {} } }), [pin])?.pinId, "pin_todo0001")
    assert.strictEqual(createsInPin(call({ tool: "createPage", arguments: { parentId: todo } }), [pin])?.pinId, "pin_todo0001")
    assert.strictEqual(createsInPin(call({ tool: "append-block-children", arguments: { pages: [{ parent: { database_id: todo } }] } }), [pin])?.pinId, "pin_todo0001")
  })

  it("stays out of it whenever anything is uncertain", () => {
    // The rule does not cover creating, or says nothing about what it covers.
    assert.isUndefined(createsInPin(call({ operations: ["update", "delete"] }), [pin]))
    assert.isUndefined(createsInPin(call({ operations: undefined }), [pin]))
    // The tool is read-only, or nobody knows.
    assert.isUndefined(createsInPin(call({ access: "read" }), [pin]))
    assert.isUndefined(createsInPin(call({ access: "unknown" }), [pin]))
    assert.isUndefined(createsInPin(call({ access: undefined }), [pin]))
    // Not a create: the classifier judges updates and deletes.
    assert.isUndefined(createsInPin(call({ tool: "notion-update-page", arguments: { parent: { database_id: todo } } }), [pin]))
    assert.isUndefined(createsInPin(call({ tool: "address_lookup", arguments: { parent_id: todo } }), [pin]))
    // A row as parent is a sub-page inside an item, not a new item of the pin.
    assert.isUndefined(createsInPin(call({ arguments: { parent: { page_id: row } } }), [pin]))
    // Another database; the pin's id only in the content, not the destination.
    assert.isUndefined(createsInPin(call({ arguments: { parent: { data_source_id: other } } }), [pin]))
    assert.isUndefined(createsInPin(call({ arguments: { pages: [{ content: `see https://www.notion.so/${todo}` }] } }), [pin]))
    assert.isUndefined(createsInPin(call(), []))
  })
})

const notion = { ...resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" }), orgId }
const guardWith = (operations: ReadonlyArray<GuardOperation> | undefined): Guard => ({
  id: GuardId.make("grd_todolist01"), orgId, projectId: null, resourceIds: [], name: "todo", nameFollowsRule: false, modeFollowsRule: false, applies: null, approvers: [],
  rule: "nobody can update todo list in notion", mode: "enforce", threshold: 0.5, status: "active",
  compiled: { instructions: "Does this call change the Notion to-do list?", examples: [], ...(operations === undefined ? {} : { operations }) },
  compiledVersion: 1, testCalls: [], verify: null, createdBy: userId, createdAt: now, updatedAt: null,
  pins: [{ id: "pin_todo0001", resourceId: ResourceId.make("res_notion0001"), entityId: dashed(todo), label: "Todo", kind: "database", pinnedBy: UserId.make("usr_founder01"), pinnedAt: now }]
})

/** The evaluator with Clef answering 17%, as it did for "add a row to the Todo data source by id" in the pinned eval. */
const evaluator = (guard: Guard, classifier: "up" | "down" = "up") =>
  GuardEvaluator.layer.pipe(
    Layer.provideMerge(memoryPinChildren(new Map([["pin_todo0001", [todoSource]]]))),
    Layer.provide(fakeTeams([])),
    Layer.provide(Layer.succeed(GuardsRepo, { list: () => Effect.succeed([]), active: () => Effect.succeed([guard]), find: () => Effect.succeed(Option.none()), insert: () => Effect.void, save: () => Effect.void, setRun: () => Effect.succeed(false), saveForRun: () => Effect.succeed(false) })),
    Layer.provide(Layer.succeed(Classifier, {
      classify: (_state, questions) => classifier === "up" ? Effect.succeed(new Map([...questions.keys()].map((id) => [id, 0.17]))) : Effect.die("unused")
    })),
    Layer.provide(Layer.succeed(Approvals, { listPending: () => Effect.die("unused"), decide: () => Effect.die("unused"), request: () => Effect.die("unused") }))
  )

const createRow = (access: "write" | "unknown" = "write") =>
  GuardEvaluator.use((e) => e.evaluate(userPrincipal(), {
    resource: notion,
    tool: "notion-create-pages",
    arguments: { parent: { data_source_id: todoSource }, pages: [{ properties: { Task: "Water plants" } }] },
    toolInfo: { gatewayName: "notion__notion-create-pages", title: "Create pages", access }
  }))

describe("creating inside a pinned entity at call time", () => {
  it.effect("denies it even when the classifier scores it low, and records why", () =>
    Effect.gen(function*() {
      const evaluation = yield* createRow()
      assert.strictEqual(evaluation.decision._tag, "Deny")
      assert.deepStrictEqual(evaluation.certain, [GuardId.make("grd_todolist01")])
      assert.strictEqual(evaluation.scores["grd_todolist01"], 1)
    }).pipe(Effect.provide(evaluator(guardWith(["create", "update", "delete"])))))

  it.effect("leaves it to the classifier when the rule does not cover creating, or the tool's access is unknown", () =>
    Effect.gen(function*() {
      const evaluation = yield* createRow()
      assert.strictEqual(evaluation.decision._tag, "Allow")
      assert.isUndefined(evaluation.certain)
      assert.strictEqual(evaluation.scores["grd_todolist01"], 0.17)
    }).pipe(Effect.provide(evaluator(guardWith(["update", "delete"])))))

  it.effect("an unknown access is never certain", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* createRow("unknown")).decision._tag, "Allow")
    }).pipe(Effect.provide(evaluator(guardWith(["create"])))))
})

import { assert, describe, it } from "@effect/vitest"
import { ApprovalId, type Decision, DenyReason, GuardId, PolicyDenied } from "@pc/domain"
import { Effect, Layer, Schema } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { makeBuiltinProvider } from "../gateway-tools/builtin"
import { skillContent } from "../testing/skill-content"
import type { ProposedAction } from "../guards/evaluator"
import { userPrincipal } from "../testing/fixtures"
import { accessOf, allowAll, fakeGuards, memoryPinChildren, type Recorded, recordingAudit, resourceOf } from "../testing/gateway-fakes"
import { ToolCatalog } from "./catalog"
import { CallToolName, SearchToolName } from "./search/meta-tools"
import { ToolSearchSettings } from "./search/mode"
import { McpGateway } from "./gateway"
import { ToolPipeline } from "./pipeline"
import { type GatewayTool, type ToolProvider, ToolProviders } from "./provider"
import { textResult } from "./sdk"
import { withoutBuiltins } from "../testing/builtin-skills"

const reports = resourceOf("res_reports01", "Reports", { kind: "variable", value: "x" })

/** A provider whose tools count executions, so tests can prove a refused call never ran. */
const fakeProvider = (source: string, names: ReadonlyArray<string>, runs: Array<string>, target = reports): ToolProvider => ({
  source,
  tools: () =>
    Effect.succeed(names.map((name): GatewayTool => ({
      definition: { name, description: source, inputSchema: { type: "object" } },
      target,
      operation: name,
      prepare: (args) =>
        args.forbidden === true
          ? Effect.fail(new PolicyDenied({ reasons: [{ _tag: "ActionNotGranted", resourceId: reports.id, required: "write" }] }))
          : Effect.succeed({ arguments: { normalised: true }, execute: Effect.sync(() => (runs.push(`${source}:${name}`), textResult("ok"))) })
    })))
})

const broken: ToolProvider = { source: "broken", tools: () => Effect.die(new Error("provider bug")) }

const gatewayWith = (providers: ReadonlyArray<ToolProvider>, decision: Decision, events: Array<Recorded>, asked: Array<ProposedAction>) =>
  McpGateway.layer.pipe(
    Layer.provide(Layer.mergeAll(ToolCatalog.layer, ToolPipeline.layer.pipe(Layer.provide(memoryPinChildren())), ToolSearchSettings.fixed(null))),
    Layer.provide([
      Layer.succeed(ToolProviders, providers),
      Layer.succeed(AccessPolicy, { resolve: () => Effect.succeed(accessOf()) }),
      fakeGuards({ decision, scores: { grd_q3guard01: 0.9 } }, asked),
      recordingAudit(events)
    ])
  )

const setup = (decision: Decision = allowAll.decision) => {
  const runs: Array<string> = []
  const events: Array<Recorded> = []
  const asked: Array<ProposedAction> = []
  const providers = [fakeProvider("alpha", ["a__one", "shared__x"], runs), broken, fakeProvider("beta", ["shared__x", "b__two"], runs)]
  return { runs, events, asked, layer: gatewayWith(providers, decision, events, asked) }
}

const principal = userPrincipal()
const call = (name: string, args: Record<string, unknown> = {}) => McpGateway.use((gateway) => gateway.callTool(principal, name, args))

describe("MCP gateway with pluggable tool providers", () => {
  it.effect("lists every provider's tools; earlier providers win a name and a failing provider hides only itself", () => {
    const { layer } = setup()
    return Effect.gen(function*() {
      const tools = yield* McpGateway.use((gateway) => gateway.listTools(principal))
      assert.deepStrictEqual(tools.map((tool) => `${tool.description}:${tool.name}`), ["alpha:a__one", "alpha:shared__x", "beta:b__two"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("runs an allowed call after guards saw the prepared arguments, and audits it", () => {
    const { layer, runs, events, asked } = setup()
    return Effect.gen(function*() {
      const result = yield* call("b__two", { raw: 1 })
      assert.isFalse(result.isError)
      assert.deepStrictEqual(runs, ["beta:b__two"])
      assert.deepStrictEqual(asked.map((action) => [action.tool, action.arguments]), [["b__two", { normalised: true }]])
      // Guards also learn what the tool is, from its listing: without it opaque ids say nothing.
      assert.deepStrictEqual(asked[0]?.toolInfo, { gatewayName: "b__two", title: undefined, description: "beta", access: "unknown" })
      // The intent is recorded before the upstream runs, the outcome after.
      assert.deepStrictEqual(events.map((event) => event.type), ["mcp.tool_call_started", "mcp.tool_called"])
      assert.deepStrictEqual(events[0]?.target, { type: "resource", id: reports.id })
      assert.deepStrictEqual(events[0]?.data.arguments, { normalised: true })
    }).pipe(Effect.provide(layer))
  })

  it.effect("refuses unknown tools without running anything, recording a well-formed reason", () => {
    const { layer, runs, events } = setup()
    return Effect.gen(function*() {
      assert.isTrue((yield* call("nope__x")).isError)
      assert.deepStrictEqual(runs, [])
      assert.deepStrictEqual(events.map((event) => event.type), ["policy.denied"])
      // The audit view decodes `reasons` with `DenyReason`; a bare tag would render as an opaque denial.
      assert.deepStrictEqual(Schema.decodeUnknownSync(Schema.Array(DenyReason))(events[0]?.data.reasons), [{ _tag: "UnknownTool", tool: "nope__x" }])
    }).pipe(Effect.provide(layer))
  })

  it.effect("stops at the grant check before guards are asked", () => {
    const { layer, runs, events, asked } = setup()
    return Effect.gen(function*() {
      assert.isTrue((yield* call("a__one", { forbidden: true })).isError)
      assert.deepStrictEqual([runs, asked.length], [[], 0])
      assert.deepStrictEqual(events.map((event) => event.type), ["policy.denied"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("serves built-ins through the same pipeline, without guards since they target no resource", () => {
    const events: Array<Recorded> = []
    const asked: Array<ProposedAction> = []
    return Effect.gen(function*() {
      const result = yield* call("skills_list")
      assert.deepStrictEqual(withoutBuiltins(JSON.parse(String(result.content[0]?.text))), [])
      assert.deepStrictEqual([asked.length, events.map((event) => [event.type, event.target])], [0, [["mcp.tool_call_started", null], ["mcp.tool_called", null]]])
    }).pipe(
      Effect.provide(Layer.unwrap(Effect.map(makeBuiltinProvider, (builtin) => gatewayWith([builtin], allowAll.decision, events, asked)))),
      Effect.provide(skillContent())
    )
  })

  it.effect("does not execute when a guard denies or needs approval", () =>
    Effect.gen(function*() {
      const denied = setup({ _tag: "Deny", reasons: [{ _tag: "GuardViolation", guardId: GuardId.make("grd_q3guard01"), probability: 0.9 }] })
      yield* call("a__one").pipe(Effect.provide(denied.layer))
      assert.deepStrictEqual([denied.runs, denied.events.map((event) => event.type)], [[], ["policy.denied"]])

      const pending = setup({ _tag: "PendingApproval", approvalId: ApprovalId.make("apr_approval01"), guardId: GuardId.make("grd_q3guard01") })
      const result = yield* call("a__one").pipe(Effect.provide(pending.layer))
      assert.include(String(result.content[0]?.text), "apr_approval01")
      assert.deepStrictEqual([pending.runs, pending.events.map((event) => event.type)], [[], ["policy.pending_approval"]])
    }))

  it.effect("in search mode lists only the meta-tools, and call_tool runs the real tool through the same checks", () => {
    const { layer, runs, asked } = setup()
    return Effect.gen(function*() {
      const listed = yield* McpGateway.use((gateway) => gateway.listTools(principal, "search"))
      assert.deepStrictEqual(listed.map((tool) => tool.name), [SearchToolName, CallToolName])
      const found = yield* call(SearchToolName, { query: "two" })
      assert.include(String(found.content[0]?.text), "b__two")

      assert.isFalse((yield* call(CallToolName, { name: "b__two", arguments: { raw: 1 } })).isError)
      assert.deepStrictEqual([runs, asked.map((action) => action.tool)], [["beta:b__two"], ["b__two"]])
      assert.isTrue((yield* call(CallToolName, { name: "a__one", arguments: { forbidden: true } })).isError)
      assert.isTrue((yield* call(CallToolName, { name: CallToolName })).isError)
      assert.deepStrictEqual(runs, ["beta:b__two"])
    }).pipe(Effect.provide(layer))
  })
})

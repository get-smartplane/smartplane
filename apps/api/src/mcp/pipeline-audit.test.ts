import { assert, describe, it } from "@effect/vitest"
import type { AuditEventType } from "@pc/domain"
import { Effect, Layer } from "effect"
import { userPrincipal } from "../testing/fixtures"
import { allowAll, fakeGuards, memoryPinChildren, type Recorded, recordingAudit, resourceOf } from "../testing/gateway-fakes"
import { ToolPipeline } from "./pipeline"
import type { GatewayTool } from "./provider"
import { textResult } from "./sdk"

const reports = resourceOf("res_reports01", "Reports", { kind: "variable", value: "x" })
const big = "x".repeat(200_000)

const toolCounting = (runs: Array<string>): GatewayTool => ({
  definition: { name: "a__write", description: "writes", inputSchema: { type: "object" } },
  target: reports,
  operation: "write",
  prepare: (args) => Effect.succeed({ arguments: args, execute: Effect.sync(() => (runs.push("write"), textResult("ok"))) })
})

const world = (unavailable: ReadonlySet<AuditEventType> = new Set()) => {
  const runs: Array<string> = []
  const events: Array<Recorded> = []
  const layer = ToolPipeline.layer.pipe(
    Layer.provide([memoryPinChildren(), fakeGuards(allowAll), recordingAudit(events, unavailable)])
  )
  const run = (args: Readonly<Record<string, unknown>> = { body: "hi" }) =>
    ToolPipeline.use((pipeline) => pipeline.run(userPrincipal(), toolCounting(runs), args)).pipe(Effect.provide(layer))
  return { runs, events, run }
}

describe("tool call auditing", () => {
  it.effect("records the intent before the upstream runs and links the outcome to it", () => {
    const { runs, events, run } = world()
    return Effect.gen(function*() {
      const result = yield* run()
      assert.isFalse(result.isError)
      assert.deepStrictEqual(runs, ["write"])
      assert.deepStrictEqual(events.map((event) => event.type), ["mcp.tool_call_started", "mcp.tool_called"])
      assert.deepStrictEqual(events[0]?.data.arguments, { body: "hi" })
      assert.isString(events[1]?.data.startedEventId)
    })
  })

  it.effect("fails closed: when the intent cannot be recorded, the tool never runs", () => {
    const { runs, events, run } = world(new Set(["mcp.tool_call_started"]))
    return Effect.gen(function*() {
      const result = yield* run()
      assert.isTrue(result.isError)
      assert.match(String(result.content[0]?.text), /audit log/)
      assert.deepStrictEqual(runs, [])
      assert.deepStrictEqual(events, [])
    })
  })

  it.effect("returns the real result when only the outcome cannot be recorded, so the agent does not repeat it", () => {
    const { runs, events, run } = world(new Set(["mcp.tool_called"]))
    return Effect.gen(function*() {
      const result = yield* run({ body: big })
      assert.isFalse(result.isError)
      assert.deepStrictEqual(runs, ["write"])
      assert.deepStrictEqual(events.map((event) => event.type), ["mcp.tool_call_started"])
    })
  })
})

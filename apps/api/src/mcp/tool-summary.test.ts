import { assert, describe, it } from "@effect/vitest"
import { toolAccessOf, toolSummaryOf } from "./tool-summary"

const tool = (annotations?: Record<string, unknown>) => ({ name: "t", inputSchema: { type: "object" }, ...(annotations === undefined ? {} : { annotations }) })

describe("MCP tool annotations", () => {
  it("maps hints to read, write, destructive or unknown, with the spec's defaults", () => {
    assert.strictEqual(toolAccessOf({ readOnlyHint: true }), "read")
    // readOnlyHint wins: destructiveHint is meaningful only for tools that write.
    assert.strictEqual(toolAccessOf({ readOnlyHint: true, destructiveHint: true }), "read")
    assert.strictEqual(toolAccessOf({ readOnlyHint: false, destructiveHint: false }), "write")
    assert.strictEqual(toolAccessOf({ destructiveHint: true }), "destructive")
    // Not read-only and silent on destruction: the spec's default is destructive.
    assert.strictEqual(toolAccessOf({ readOnlyHint: false }), "destructive")
    assert.strictEqual(toolAccessOf({}), "unknown")
  })

  it("summarises a listed tool without its input schema, ignoring annotations that do not decode", () => {
    assert.deepStrictEqual(toolSummaryOf({ ...tool({ title: "Delete issue", destructiveHint: true, idempotentHint: true, openWorldHint: false }), description: "Deletes it" }), {
      name: "t",
      title: "Delete issue",
      description: "Deletes it",
      access: "destructive",
      idempotent: true,
      openWorld: false
    })
    assert.deepStrictEqual(toolSummaryOf(tool()), { name: "t", access: "unknown" })
    assert.deepStrictEqual(toolSummaryOf(tool({ readOnlyHint: "yes" })), { name: "t", access: "unknown" })
  })
})

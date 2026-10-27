import { describe, expect, it } from "vitest"
import { eventLabel, eventTone } from "./event-label"

describe("audit event labels", () => {
  it("reads a tool call's intent and outcome as two steps", () => {
    expect(eventLabel("mcp.tool_call_started")).toBe("Call started")
    expect(eventTone("mcp.tool_call_started")).toBe("info")
    expect(eventLabel("mcp.tool_called")).toBe("Call allowed")
    expect(eventTone("mcp.tool_called")).toBe("success")
  })
})

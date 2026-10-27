import { describe, expect, it } from "@effect/vitest"
import { DateTime, Schema } from "effect"
import { AuditEventId, OrgId, UserId } from "../ids"
import type { AuditEvent } from "./event"
import { AuditQueueMessage, TraceParent } from "./trace"

const auditEventFixture: AuditEvent = {
  id: AuditEventId.make("evt_abcdefgh"),
  orgId: OrgId.make("org_abcdefgh"),
  type: "mcp.tool_called",
  actor: { type: "user", id: UserId.make("usr_abcdefgh") },
  target: null,
  data: { tool: "search" },
  ip: null,
  userAgent: null,
  requestId: null,
  occurredAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z")
}

const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
const codec = Schema.toCodecJson(AuditQueueMessage)

describe("AuditQueueMessage", () => {
  it("accepts W3C traceparents and rejects malformed or all-zero ids", () => {
    expect(Schema.is(TraceParent)(traceparent)).toBe(true)
    expect(Schema.is(TraceParent)("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBe(false)
    expect(Schema.is(TraceParent)("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7")).toBe(false)
  })

  it("round-trips the trace through JSON and still decodes messages without one", () => {
    const message = { ...auditEventFixture, trace: { traceparent } }
    const wire: unknown = JSON.parse(JSON.stringify(Schema.encodeSync(codec)(message)))
    expect(Schema.decodeUnknownSync(codec)(wire).trace?.traceparent).toBe(traceparent)
    const legacy: unknown = JSON.parse(JSON.stringify(Schema.encodeSync(codec)(auditEventFixture)))
    expect(Schema.decodeUnknownSync(codec)(legacy).trace).toBeUndefined()
  })

  it("rejects a forged trace field", () => {
    const encoded = JSON.stringify(Schema.encodeSync(codec)({ ...auditEventFixture, trace: { traceparent } }))
    const wire: unknown = JSON.parse(encoded.replace(traceparent, "nope"))
    expect(() => Schema.decodeUnknownSync(codec)(wire)).toThrow()
  })
})

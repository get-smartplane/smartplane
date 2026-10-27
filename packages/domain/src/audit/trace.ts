import { Schema } from "effect"
import { AuditEvent } from "./event"

/** W3C `traceparent` (version 00): `00-<32 hex trace id>-<16 hex span id>-<2 hex flags>`. */
export const TraceParent = Schema.String.check(
  Schema.isPattern(/^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/)
).annotate({ identifier: "TraceParent" })
export type TraceParent = typeof TraceParent.Type

/** Trace context carried across async hops (queue, Durable Object RPC) so the work joins the caller's trace. */
export const TraceContext = Schema.Struct({ traceparent: TraceParent }).annotate({ identifier: "TraceContext" })
export type TraceContext = typeof TraceContext.Type

/**
 * The AUDIT_QUEUE message: an event plus the trace of the operation that emitted it. `trace` is transport
 * metadata: it is neither stored nor hashed, so the chain is identical with or without it.
 */
export const AuditQueueMessage = Schema.Struct({
  ...AuditEvent.fields,
  trace: Schema.optionalKey(TraceContext)
}).annotate({ identifier: "AuditQueueMessage" })
export type AuditQueueMessage = typeof AuditQueueMessage.Type

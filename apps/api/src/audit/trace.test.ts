import { assert, describe, it } from "@effect/vitest"
import type { AuditEvent, OrgId, TraceContext } from "@pc/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { AuditLogClient } from "../platform/audit-log-client"
import { AuditQueue } from "../platform/audit-queue"
import { currentTraceContext } from "../telemetry/trace-context"
import { auditEvent, orgId } from "../testing/fixtures"
import { AuditLog } from "./audit-log"
import { consumeAuditBatch, type AuditMessage } from "./consumer"
import { AuditQueueMessageWire } from "./wire"

const traceIdOf = (trace: TraceContext | undefined) => trace?.traceparent.split("-")[1]

/** Records what the producer enqueued, as the JSON a Cloudflare queue would deliver. */
const capturingQueue = (bodies: Array<unknown>) =>
  Layer.succeed(AuditQueue, {
    send: (event, trace = Option.none()) =>
      Schema.encodeEffect(AuditQueueMessageWire)(Option.match(trace, { onNone: () => event, onSome: (t) => ({ ...event, trace: t }) })).pipe(
        Effect.orDie,
        Effect.map((body) => void bodies.push(roundTrip(body)))
      )
  })

/** Records the trace context each Durable Object append would receive. */
const capturingClient = (calls: Array<{ orgId: OrgId; events: ReadonlyArray<AuditEvent>; trace: TraceContext | undefined }>) =>
  Layer.succeed(AuditLogClient, {
    append: (orgId, events) =>
      Effect.map(currentTraceContext, (trace) => {
        calls.push({ orgId, events, trace: Option.getOrUndefined(trace) })
        return events.length
      }),
    verify: () => Effect.die("not used")
  })

/** What a queue delivers: the JSON of what was sent. */
const roundTrip = (body: unknown): unknown => JSON.parse(JSON.stringify(body))

const message = (body: unknown, acked: Array<unknown>): AuditMessage => ({ id: "msg", attempts: 1, body, ack: () => void acked.push(body), retry: () => {} })

describe("trace propagation through the audit queue", () => {
  it.effect("carries the emitting span's traceparent into the queue message", () => {
    const bodies: Array<unknown> = []
    return Effect.gen(function*() {
      const requestTrace = yield* AuditLog.use((audit) =>
        audit.record({ orgId, type: "mcp.tool_called", actor: { type: "system", id: "test" } }).pipe(
          Effect.andThen(currentTraceContext),
          Effect.withSpan("http.request")
        )
      )
      const [body] = bodies
      const decoded = Schema.decodeUnknownSync(AuditQueueMessageWire)(body)
      assert.strictEqual(traceIdOf(decoded.trace), traceIdOf(Option.getOrUndefined(requestTrace)))
    }).pipe(Effect.provide(AuditLog.layer.pipe(Layer.provide(capturingQueue(bodies)))))
  })

  it.effect("continues the message's trace in the consumer and hands it to the Durable Object", () => {
    const calls: Array<{ orgId: OrgId; events: ReadonlyArray<AuditEvent>; trace: TraceContext | undefined }> = []
    const acked: Array<unknown> = []
    const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    const encode = Schema.encodeSync(AuditQueueMessageWire)
    const traced = roundTrip(encode({ ...auditEvent(1), trace: { traceparent } }))
    const untraced = roundTrip(encode(auditEvent(2)))
    return Effect.gen(function*() {
      yield* consumeAuditBatch([message(traced, acked), message(untraced, acked)]).pipe(Effect.withSpan("queue.audit-events"))
      assert.strictEqual(calls.length, 1)
      assert.strictEqual(calls[0]?.events.length, 2)
      assert.strictEqual(traceIdOf(calls[0]?.trace), "4bf92f3577b34da6a3ce929d0e0e4736")
      assert.notStrictEqual(calls[0]?.trace?.traceparent, traceparent, "the append runs in a child span")
      assert.strictEqual(acked.length, 2)
    }).pipe(Effect.provide(capturingClient(calls)))
  })

  it.effect("ignores a malformed trace instead of failing the batch", () => {
    const calls: Array<{ orgId: OrgId; events: ReadonlyArray<AuditEvent>; trace: TraceContext | undefined }> = []
    const acked: Array<unknown> = []
    const valid = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    const body = JSON.stringify(Schema.encodeSync(AuditQueueMessageWire)({ ...auditEvent(1), trace: { traceparent: valid } }))
    return Effect.gen(function*() {
      yield* consumeAuditBatch([message(JSON.parse(body.replace(valid, "garbage")), acked)])
      assert.strictEqual(calls.length, 0, "a message with an invalid trace does not decode and is retried")
      assert.strictEqual(acked.length, 0)
    }).pipe(Effect.provide(capturingClient(calls)))
  })
})

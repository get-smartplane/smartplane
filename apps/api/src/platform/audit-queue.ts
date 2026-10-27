import { type AuditEvent, AuditQueueMessage, AuditUnavailable, type TraceContext } from "@pc/domain"
import { Context, Effect, Layer, Option, Schedule, Schema } from "effect"
import { AuditLogClient } from "./audit-log-client"
import { WorkerBindings } from "./bindings"

const encode = Schema.encodeEffect(Schema.toCodecJson(AuditQueueMessage))

/** Short and bounded: a request waits at most ~0.4 s per path before falling back or failing. */
export const AuditSendRetry = { schedule: Schedule.exponential("50 millis"), times: 3 } as const

type QueueSend = (body: unknown) => Promise<unknown>

/**
 * The queue first; when it keeps failing, the event is appended straight to the org's AuditLog Durable
 * Object (append is idempotent on event id), so a Queues outage alone never loses an event.
 */
const makeAuditQueue = (send: QueueSend) =>
  Effect.gen(function*() {
    const direct = yield* AuditLogClient
    const enqueue = (body: unknown) =>
      Effect.tryPromise({
        try: () => send(body),
        catch: (cause) => new AuditUnavailable({ message: `audit queue send failed: ${String(cause)}` })
      }).pipe(Effect.retry(AuditSendRetry))
    return AuditQueue.of({
      send: Effect.fn("AuditQueue.send")(function*(event: AuditEvent, trace: Option.Option<TraceContext> = Option.none()) {
        const message: AuditQueueMessage = Option.match(trace, { onNone: () => event, onSome: (trace) => ({ ...event, trace }) })
        const body = yield* encode(message).pipe(Effect.orDie)
        yield* enqueue(body).pipe(
          Effect.catchTag("AuditUnavailable", (error) =>
            Effect.logWarning("audit queue unavailable, appending directly", { eventId: event.id, error: error.message }).pipe(
              Effect.andThen(direct.append(event.orgId, [event]).pipe(Effect.retry(AuditSendRetry)))
            ))
        )
      })
    })
  })

/** Producer side of `audit-events`. An event is durable once `send` succeeds. */
export class AuditQueue extends Context.Service<AuditQueue, {
  /** `trace` lets the consumer and the AuditLog Durable Object continue the emitting request's trace. */
  readonly send: (event: AuditEvent, trace?: Option.Option<TraceContext>) => Effect.Effect<void, AuditUnavailable>
}>()("api/platform/AuditQueue") {
  /** The `audit-events` queue binding. */
  static readonly layer = Layer.effect(
    AuditQueue,
    Effect.gen(function*() {
      const queue = (yield* WorkerBindings).AUDIT_QUEUE
      return yield* makeAuditQueue((body) => queue.send(body, { contentType: "json" }))
    })
  )

  /** Over any send function; tests use it to simulate a Queues outage. */
  static readonly fromSend = (send: QueueSend) => Layer.effect(AuditQueue, makeAuditQueue(send))
}

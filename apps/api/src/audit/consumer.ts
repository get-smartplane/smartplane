import type { AuditEvent, OrgId, TraceContext } from "@pc/domain"
import { Effect, Exit, Option, Schema, type Tracer } from "effect"
import { AuditLogClient } from "../platform/audit-log-client"
import { continueTrace, remoteSpan } from "../telemetry/trace-context"
import { AuditQueueMessageWire } from "./wire"

/** The slice of a Cloudflare queue `Message` the consumer uses. */
export interface QueueMessage {
  readonly body: unknown
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

/** An audit queue message also carries its id and delivery count (1 on first delivery), for backoff and alerts. */
export interface AuditMessage extends QueueMessage {
  readonly id: string
  readonly attempts: number
}

interface Delivery {
  readonly message: AuditMessage
  readonly event: AuditEvent
  readonly trace: TraceContext | undefined
}

export const decodeAuditMessage = Schema.decodeUnknownExit(AuditQueueMessageWire)

const FirstRetrySeconds = 5
/** With `max_retries` 100 in wrangler.jsonc, capped backoff rides out an outage of about two days before the DLQ. */
const MaxRetrySeconds = 30 * 60

/** Exponential from 5 s, doubling per attempt, capped at 30 min. */
export const retryDelaySeconds = (attempts: number): number =>
  Math.min(MaxRetrySeconds, FirstRetrySeconds * 2 ** Math.min(Math.max(attempts, 1) - 1, 20))

const retry = (message: AuditMessage) => message.retry({ delaySeconds: retryDelaySeconds(message.attempts) })

/**
 * The org's append runs as a child of the first traced message, so a tool call's audit write appears in the
 * request's trace; the batch span and the other messages' traces are linked.
 */
const deliver = (orgId: OrgId, group: ReadonlyArray<Delivery>, batch: Option.Option<Tracer.AnySpan>) => {
  const [first, ...rest] = group.filter((delivery) => delivery.trace !== undefined)
  const links = [...Option.toArray(batch), ...rest.flatMap(({ trace }) => Option.toArray(remoteSpan(trace)))]
  return AuditLogClient.use((client) => client.append(orgId, group.map(({ event }) => event))).pipe(
    continueTrace("audit.deliver", first?.trace, {
      kind: "consumer",
      attributes: { "org.id": orgId, "audit.batch_size": group.length },
      links
    }),
    Effect.exit,
    Effect.flatMap((exit) =>
      Effect.sync(() => {
        for (const { message } of group) {
          if (Exit.isSuccess(exit)) message.ack()
          else retry(message)
        }
      }).pipe(Effect.andThen(Exit.isFailure(exit) ? Effect.logError("audit append failed", exit.cause) : Effect.void))
    ),
    Effect.annotateLogs({ orgId })
  )
}

/**
 * Groups a batch by org and hands each group to that org's AuditLog Durable Object. A group is acked only
 * after the append succeeds; otherwise it is retried (appends are idempotent on event id). Messages that
 * do not decode are retried too, so they end up in the dead-letter queue for inspection.
 */
export const consumeAuditBatch = Effect.fn("audit.consumeBatch")(function*(messages: ReadonlyArray<AuditMessage>) {
  const groups = new Map<OrgId, Array<Delivery>>()
  for (const message of messages) {
    const decoded = decodeAuditMessage(message.body)
    if (Exit.isFailure(decoded)) {
      yield* Effect.logError("undecodable audit message", decoded.cause)
      retry(message)
      continue
    }
    const { trace, ...event } = decoded.value
    const group = groups.get(event.orgId) ?? []
    group.push({ message, event, trace })
    groups.set(event.orgId, group)
  }
  yield* Effect.annotateCurrentSpan({ "queue.messages": messages.length, "audit.orgs": groups.size })
  const batch = yield* Effect.option(Effect.currentParentSpan)
  yield* Effect.forEach(groups, ([orgId, group]) => deliver(orgId, group, batch), { concurrency: "unbounded", discard: true })
})

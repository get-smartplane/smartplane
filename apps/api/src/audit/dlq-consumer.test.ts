import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, AuditUnavailable } from "@pc/domain"
import { Effect, Layer, Logger, Schema } from "effect"
import { AuditLogClient } from "../platform/audit-log-client"
import { auditEvent } from "../testing/fixtures"
import { consumeAuditBatch, retryDelaySeconds, type AuditMessage } from "./consumer"
import { consumeAuditDlqBatch } from "./dlq-consumer"
import { AuditQueueMessageWire } from "./wire"

interface Outcome {
  readonly acked: Array<string>
  readonly retried: Array<[string, number | undefined]>
}

const messageOf = (id: string, body: unknown, attempts: number, outcome: Outcome): AuditMessage => ({
  id,
  body,
  attempts,
  ack: () => void outcome.acked.push(id),
  retry: (options) => void outcome.retried.push([id, options?.delaySeconds])
})

const wire = (event: AuditEvent) => JSON.parse(JSON.stringify(Schema.encodeSync(AuditQueueMessageWire)(event)))

/** An AuditLogClient over a Map keyed by event id, so a replay of a stored event is a no-op like the real one. */
const idempotentClient = (stored: Map<string, AuditEvent>, down = false) =>
  Layer.succeed(AuditLogClient, {
    append: (_orgId, events) =>
      down
        ? Effect.fail(new AuditUnavailable({ message: "down" }))
        : Effect.sync(() => {
          const fresh = events.filter((event) => !stored.has(event.id))
          for (const event of fresh) stored.set(event.id, event)
          return fresh.length
        }),
    verify: () => Effect.die("not used")
  })

describe("audit queue retry backoff", () => {
  it("doubles from 5 s per attempt and caps at 30 minutes", () => {
    assert.deepStrictEqual([1, 2, 3, 4, 9, 10, 100].map(retryDelaySeconds), [5, 10, 20, 40, 1280, 1800, 1800])
  })

  it.effect("retries a failed org group with the delay for each message's attempt count", () => {
    const outcome: Outcome = { acked: [], retried: [] }
    return consumeAuditBatch([
      messageOf("m1", wire(auditEvent(1)), 1, outcome),
      messageOf("m2", wire(auditEvent(2)), 7, outcome)
    ]).pipe(
      Effect.map(() => assert.deepStrictEqual(outcome, { acked: [], retried: [["m1", 5], ["m2", 320]] })),
      Effect.provide(idempotentClient(new Map(), true))
    )
  })
})

describe("audit dead-letter queue", () => {
  it.effect("replays dead-lettered events and acks them; an event that already landed is not duplicated", () => {
    const outcome: Outcome = { acked: [], retried: [] }
    const stored = new Map<string, AuditEvent>([[auditEvent(1).id, auditEvent(1)]])
    const logs: Array<string> = []
    const logger = Logger.make(({ message }) => void logs.push(JSON.stringify(message)))
    return consumeAuditDlqBatch([
      messageOf("d1", wire(auditEvent(1)), 101, outcome),
      messageOf("d2", wire(auditEvent(2)), 101, outcome)
    ]).pipe(
      Effect.map(() => {
        assert.deepStrictEqual(outcome.acked, ["d1", "d2"])
        assert.deepStrictEqual([...stored.keys()], [auditEvent(1).id, auditEvent(2).id])
        const alerts = logs.filter((line) => line.includes('"alert":"audit.dlq_message"'))
        assert.strictEqual(alerts.length, 2, "one alertable line per dead-lettered message")
        assert.include(alerts[1], auditEvent(2).id)
      }),
      Effect.provide(Layer.merge(idempotentClient(stored), Logger.layer([logger])))
    )
  })

  it.effect("keeps a message in the DLQ while the log is still down, and acks one that can never decode", () => {
    const outcome: Outcome = { acked: [], retried: [] }
    return consumeAuditDlqBatch([
      messageOf("d1", wire(auditEvent(1)), 1, outcome),
      messageOf("junk", { not: "an event" }, 1, outcome)
    ]).pipe(
      Effect.map(() => assert.deepStrictEqual(outcome, { acked: ["junk"], retried: [["d1", 5]] })),
      Effect.provide(idempotentClient(new Map(), true))
    )
  })
})

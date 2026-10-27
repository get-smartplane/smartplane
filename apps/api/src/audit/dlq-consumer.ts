import { Effect, Exit } from "effect"
import { consumeAuditBatch, decodeAuditMessage, type AuditMessage } from "./consumer"

/**
 * `audit-events-dlq`: events whose delivery failed every retry of `audit-events`. Each is logged at error
 * level (alert on `audit.dlq_message`) and re-delivered to the org's AuditLog Durable Object exactly like the
 * main queue does; append is idempotent on event id, so an event that did land meanwhile is not duplicated.
 */
export const consumeAuditDlqBatch = Effect.fn("audit.consumeDlqBatch")(function*(messages: ReadonlyArray<AuditMessage>) {
  const replayable: Array<AuditMessage> = []
  for (const message of messages) {
    const decoded = decodeAuditMessage(message.body)
    if (Exit.isFailure(decoded)) {
      // It will never decode, so retrying only delays its loss; the raw body in the log is the record to recover from.
      yield* Effect.logError("audit.dlq_message", {
        alert: "audit.dlq_message",
        messageId: message.id,
        attempts: message.attempts,
        undecodable: true,
        body: message.body
      })
      message.ack()
      continue
    }
    yield* Effect.logError("audit.dlq_message", {
      alert: "audit.dlq_message",
      messageId: message.id,
      attempts: message.attempts,
      eventId: decoded.value.id,
      orgId: decoded.value.orgId,
      type: decoded.value.type
    })
    replayable.push(message)
  }
  yield* Effect.annotateCurrentSpan({ "queue.messages": messages.length, "audit.replayable": replayable.length })
  if (replayable.length > 0) yield* consumeAuditBatch(replayable)
})

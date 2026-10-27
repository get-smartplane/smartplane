import { Effect, Exit, Schema } from "effect"
import type { QueueMessage } from "../../audit/consumer"
import { SkillScanMessage } from "./queue"
import { SkillScanRunner } from "./scan-runner"

const decode = Schema.decodeUnknownExit(Schema.toCodecJson(SkillScanMessage))
const RetryDelaySeconds = 30

/**
 * Scans each version of a `skill-scans` batch. A failed scan is retried (and dead-lettered after the
 * queue's retries); a scanner that is merely unavailable already yields an `error` report, not a failure.
 */
export const consumeSkillScanBatch = Effect.fn("skills.consumeScanBatch")(function*(messages: ReadonlyArray<QueueMessage>) {
  const runner = yield* SkillScanRunner
  yield* Effect.annotateCurrentSpan({ "queue.messages": messages.length })
  yield* Effect.forEach(messages, (message) =>
    Effect.gen(function*() {
      const decoded = decode(message.body)
      if (Exit.isFailure(decoded)) {
        yield* Effect.logError("undecodable skill scan message", decoded.cause)
        return message.retry({ delaySeconds: RetryDelaySeconds })
      }
      const exit = yield* Effect.exit(runner.scan(decoded.value.orgId, decoded.value.versionId))
      if (Exit.isSuccess(exit)) return message.ack()
      yield* Effect.logError("skill scan failed", exit.cause)
      message.retry({ delaySeconds: RetryDelaySeconds })
    }), { concurrency: 4, discard: true })
})

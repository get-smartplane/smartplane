import { UpstreamFailure } from "@pc/domain"
import { Clock, Duration, Effect, Exit, Schema } from "effect"
import type { QueueMessage } from "../../audit/consumer"
import { VerifyJobs, type VerifyMessage, VerifyMessage as VerifyMessageSchema } from "./job"
import { MaxStageAttempts, StageTimeouts, type StepOutcome, VerifyRunner } from "./runner"
import type { StageError } from "./stage"

const decode = Schema.decodeUnknownExit(Schema.toCodecJson(VerifyMessageSchema))
const RetryDelaySeconds = 15
/** wrangler.jsonc gives `guard-self-tests` 2 queue-level retries: used only when re-queueing a stage itself fails. */
const MaxDeliveries = 3
/**
 * A consumer invocation may run 15 minutes (Cloudflare Queues limits). A stage is only started when its own
 * ceiling still fits under this; otherwise the run goes on in a fresh message.
 */
export const InvocationBudget = Duration.minutes(13)

/** Cloudflare's `Message` also counts deliveries; fakes may leave it out. */
interface CountedMessage extends QueueMessage {
  readonly attempts?: number
}

const reasonFor = (stage: VerifyMessage["stage"], error: StageError | { readonly _tag: "Forbidden"; readonly message: string }): string => {
  if (error._tag === "Forbidden") return `Stopped: ${error.message}. Verify again to restart it.`
  if (error._tag === "NotFound") return "The run expired before it could finish. Verify again."
  if (stage === "testing") return "The classifier could not be reached, so the draft is saved but untested. Verify again to test it."
  return `Verify could not finish (${error._tag === "ModelTimedOut" ? "the model was too slow" : error.message}). Verify again.`
}

/**
 * Runs verify jobs. One message carries a run through as many stages as fit in this invocation; a stage that
 * fails transiently is queued again (with its attempt count) and, on its last attempt, the run is marked
 * failed with a reason. A lost admin fails the run at once. Stale or ended runs are dropped.
 */
export const consumeVerifyBatch = Effect.fn("guards.consumeVerifyBatch")(function*(messages: ReadonlyArray<CountedMessage>) {
  const runner = yield* VerifyRunner
  const jobs = yield* VerifyJobs
  yield* Effect.forEach(messages, (message) =>
    Effect.gen(function*() {
      const decoded = decode(message.body)
      if (Exit.isFailure(decoded)) {
        yield* Effect.logError("undecodable guard verify message", decoded.cause)
        return message.ack()
      }
      const started = yield* Clock.currentTimeMillis
      let current = decoded.value
      let job: Extract<StepOutcome, { _tag: "advanced" }>["job"] | undefined
      while (true) {
        const result = yield* Effect.result(runner.step(current, job).pipe(
          Effect.catchDefect((defect) => Effect.as(Effect.logError("guard verify stage died", defect), new UpstreamFailure({ upstream: "guard-verify", message: "an unexpected error" })).pipe(Effect.flip))
        ))
        if (result._tag === "Success") {
          const outcome = result.success
          if (outcome._tag !== "advanced") return message.ack()
          const elapsed = (yield* Clock.currentTimeMillis) - started
          const next: VerifyMessage = { ...current, stage: outcome.stage, attempt: 1 }
          if (elapsed + Duration.toMillis(StageTimeouts[outcome.stage]) > Duration.toMillis(InvocationBudget)) return yield* requeue(next, 0)
          current = next
          job = outcome.job
          continue
        }
        const error = result.failure
        yield* Effect.logWarning("guard verify stage failed", { stage: current.stage, attempt: current.attempt, error: error._tag })
        // A job missing from KV may only be propagation lag between locations: retried like any transient failure.
        if (error._tag === "Forbidden" || current.attempt >= MaxStageAttempts) {
          yield* runner.fail(current, reasonFor(current.stage, error))
          return message.ack()
        }
        return yield* requeue({ ...current, attempt: current.attempt + 1 }, RetryDelaySeconds)
      }

      function requeue(next: VerifyMessage, delaySeconds: number) {
        return Effect.gen(function*() {
          const queued = yield* Effect.exit(jobs.enqueue(next, delaySeconds))
          if (Exit.isSuccess(queued)) return message.ack()
          if ((message.attempts ?? 1) < MaxDeliveries) return message.retry({ delaySeconds: RetryDelaySeconds })
          yield* runner.fail(next, "Verify could not be continued. Verify again.")
          message.ack()
        })
      }
    }), { concurrency: 2, discard: true })
})

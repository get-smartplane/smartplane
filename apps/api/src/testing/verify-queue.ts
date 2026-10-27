import { UpstreamFailure } from "@pc/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { consumeVerifyBatch } from "../guards/verify-job/consumer"
import { type VerifyJob, VerifyJobs, VerifyMessage } from "../guards/verify-job/job"

const encode = Schema.encodeSync(Schema.toCodecJson(VerifyMessage))

/** What the fake queue saw: messages sent (with their delay), and how the consumer settled each delivery. */
export interface VerifyQueue {
  readonly jobs: Map<string, VerifyJob>
  readonly sent: Array<{ readonly message: VerifyMessage; readonly delaySeconds: number | undefined }>
  readonly settled: Array<"ack" | "retry">
  /** Make the next `n` sends fail, as a queue outage would. */
  failSends: number
}

export const verifyQueue = (): { readonly queue: VerifyQueue; readonly layer: Layer.Layer<VerifyJobs> } => {
  const queue: VerifyQueue = { jobs: new Map(), sent: [], settled: [], failSends: 0 }
  const layer = Layer.succeed(VerifyJobs, {
    save: (job) => Effect.sync(() => void queue.jobs.set(job.runId, job)),
    load: (runId) => Effect.sync(() => Option.fromUndefinedOr(queue.jobs.get(runId))),
    enqueue: (message, delaySeconds) =>
      Effect.suspend(() => {
        if (queue.failSends > 0) {
          queue.failSends -= 1
          return Effect.fail(new UpstreamFailure({ upstream: "guard-self-tests", message: "queue unavailable" }))
        }
        queue.sent.push({ message, delaySeconds })
        return Effect.void
      })
  })
  return { queue, layer }
}

/**
 * Delivers every message sent so far (and those the consumer sends while running) to the real consumer,
 * one batch per message, like Cloudflare with `max_batch_size: 1`. Stops after `limit` deliveries.
 */
export const drainVerifyQueue = (queue: VerifyQueue, limit = 20) =>
  Effect.gen(function*() {
    let delivered = 0
    while (queue.sent.length > 0 && delivered < limit) {
      const { message } = queue.sent.shift()!
      delivered += 1
      yield* consumeVerifyBatch([{ body: encode(message), ack: () => void queue.settled.push("ack"), retry: () => void queue.settled.push("retry"), attempts: 1 }])
    }
    return delivered
  })

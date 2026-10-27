import { Effect } from "effect"
import { consumeAuditBatch } from "./audit/consumer"
import { consumeAuditDlqBatch } from "./audit/dlq-consumer"
import type { WorkerEnv } from "./platform/bindings"
import type { AuditLogClient } from "./platform/audit-log-client"
import { consumeVerifyBatch } from "./guards/verify-job/consumer"
import type { VerifyJobs } from "./guards/verify-job/job"
import type { VerifyRunner } from "./guards/verify-job/runner"
import { consumeSkillScanBatch } from "./skills/scan/consumer"
import type { SkillScanRunner } from "./skills/scan/scan-runner"
import { appFor } from "./workers/app"
import { nightly } from "./workers/scheduled"

export { AuditLogObject as AuditLog } from "./audit/durable-object"
export { RateLimiterObject as RateLimiter } from "./delivery/rate-limit-object"

/** Skill scans and guard verify runs have their own queues (wrangler.jsonc); every other batch is audit events. */
const SkillScansQueue = "skill-scans"
const GuardSelfTestsQueue = "guard-self-tests"
const AuditDeadLetterQueue = "audit-events-dlq"

export default {
  async fetch(request, env, ctx) {
    const { web, runner } = appFor(env)
    const invocation = await runner.open()
    try {
      return await web.handler(request, invocation.context)
    } finally {
      ctx.waitUntil(invocation.close())
    }
  },

  async queue(batch, env, ctx) {
    const consume: Effect.Effect<void, never, AuditLogClient | SkillScanRunner | VerifyRunner | VerifyJobs> = batch.queue === SkillScansQueue
      ? consumeSkillScanBatch(batch.messages)
      : batch.queue === GuardSelfTestsQueue
      ? consumeVerifyBatch(batch.messages)
      : batch.queue === AuditDeadLetterQueue
      ? consumeAuditDlqBatch(batch.messages)
      : consumeAuditBatch(batch.messages)
    await appFor(env).runner.run(
      Effect.withSpan(consume, `queue.${batch.queue}`, { attributes: { "queue.name": batch.queue } }),
      (promise) => ctx.waitUntil(promise)
    )
  },

  async scheduled(controller, env, ctx) {
    await appFor(env).runner.run(
      nightly().pipe(Effect.withSpan("cron", { attributes: { "cron.schedule": controller.cron } })),
      (promise) => ctx.waitUntil(promise)
    )
  }
} satisfies ExportedHandler<WorkerEnv>

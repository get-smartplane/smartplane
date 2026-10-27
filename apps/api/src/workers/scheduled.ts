import { Effect } from "effect"
import { systemActor } from "../audit/actor"
import { archiveAuditBacklog } from "../audit/archiver"
import { purgeExpiredAudit } from "../audit/purge"
import { KeyRotation } from "../secrets/key-rotation"
import { expireApprovals } from "./approval-expiry"

/** A failing step is logged and reported as -1; it never cancels the steps after it. */
export const isolated = <R>(name: string, step: Effect.Effect<number, unknown, R>) =>
  step.pipe(Effect.catchCause((cause) => Effect.as(Effect.logError("cron step failed", { step: name, cause }), -1)))

/**
 * Nightly: archive every complete audit day not yet in R2, purge D1 rows past retention (archive first, so the
 * purge finds it), re-wrap a batch of secret data keys onto the current KEK, and expire stale approvals.
 */
export const nightly = Effect.fn("cron.nightly")(function*() {
  const archivedDays = yield* isolated("archive", archiveAuditBacklog())
  const purgedEvents = yield* isolated("purge", purgeExpiredAudit())
  const rewrapped = yield* isolated(
    "rewrap",
    KeyRotation.use((rotation) => Effect.map(rotation.rewrap(undefined, systemActor("cron")), (result) => result.rewrapped))
  )
  const expiredApprovals = yield* isolated("expireApprovals", expireApprovals())
  yield* Effect.annotateCurrentSpan({
    "cron.archived_days": archivedDays,
    "cron.purged_audit_events": purgedEvents,
    "cron.rewrapped_secret_versions": rewrapped,
    "cron.expired_approvals": expiredApprovals
  })
})

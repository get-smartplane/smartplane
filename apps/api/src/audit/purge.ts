import type { OrgId } from "@pc/domain"
import { DateTime, Effect, Option, Schema } from "effect"
import { AuditArchive } from "../platform/archive"
import { systemActor } from "./actor"
import { type ArchiveDay, archiveDay, archiveKey, ArchiveMetadata, covers } from "./archive-key"
import { archiveOrgDay } from "./archiver"
import { AuditLog } from "./audit-log"
import { AuditRetentionStore } from "./retention-store"
import { AuditStore } from "./store"

/** Bounds one night's work per org; a backlog drains over the following nights. */
const MaxDaysPerRun = 31

const decodeMetadata = Schema.decodeUnknownOption(ArchiveMetadata)

/**
 * Walks an org's days oldest first, up to the retention cutoff, and returns how far the prefix of the chain
 * is safely archived. A day whose archive is missing or stale is re-archived first; it stops at the first day
 * that still is not covered, because a purge must stay a contiguous prefix for verification to anchor on.
 */
const archivedPrefix = Effect.fn("audit.archivedPrefix")(function*(orgId: OrgId, cutoff: DateTime.Utc) {
  const store = yield* AuditRetentionStore
  const archive = yield* AuditArchive
  let boundary: { readonly seq: number; readonly key: string } | undefined
  let lastVerified = 0
  let next = yield* store.nextEventAt(orgId, DateTime.makeUnsafe(0))
  for (let days = 0; days < MaxDaysPerRun && Option.isSome(next) && DateTime.isLessThan(next.value, cutoff); days++) {
    // The cutoff is a UTC midnight, so a day that starts before it also ends by it.
    const day: ArchiveDay = archiveDay(next.value)
    const range = yield* store.dayRange(orgId, day.from, day.to)
    if (Option.isNone(range)) break
    const key = archiveKey(orgId, day)
    const isCovered = Effect.map(archive.metadata(key), (found) => covers(Option.flatMap(found, decodeMetadata), range.value))
    // A day whose archive went missing, or that gained late events after it was archived, is re-archived here;
    // otherwise the purge would stop at it every night from now on.
    if (!(yield* isCovered)) {
      const outcome = yield* archiveOrgDay(orgId, day).pipe(
        Effect.catchTag("ArchiveUnavailable", (error) => Effect.as(Effect.logWarning("audit re-archive failed", { orgId, key, error }), "failed"))
      )
      const repaired = outcome === "archived" && (yield* isCovered)
      if (!repaired) {
        yield* Effect.logWarning("audit purge stopped: day archive missing or mismatched", { orgId, key })
        break
      }
    }
    // Events are chained in arrival order, so a later day's event can precede a verified day's last seq: every
    // event below the first later-day seq occurred in a day verified so far, but nothing from there on is known.
    lastVerified = Math.max(lastVerified, range.value.lastSeq)
    const laterFirst = yield* store.firstSeqFrom(orgId, day.to)
    const seq = Option.match(laterFirst, { onNone: () => lastVerified, onSome: (first) => first - 1 })
    if (boundary === undefined || seq > boundary.seq) boundary = { seq, key }
    next = yield* store.nextEventAt(orgId, day.to)
  }
  return Option.fromUndefinedOr(boundary)
})

/** Deletes one org's audit rows older than its retention, after confirming they are archived in R2. */
export const purgeOrgAudit = Effect.fn("audit.purgeOrg")(function*(orgId: OrgId, retentionDays: number) {
  const store = yield* AuditRetentionStore
  const audit = yield* AuditLog
  const now = yield* DateTime.now
  const cutoff = DateTime.startOf(DateTime.subtract(now, { days: retentionDays }), "day")
  yield* Effect.annotateCurrentSpan({ "org.id": orgId, "audit.retention_days": retentionDays })

  const boundary = yield* archivedPrefix(orgId, cutoff)
  if (Option.isNone(boundary)) return 0
  const { seq: throughSeq, key: archivedKey } = boundary.value
  const previous = yield* AuditStore.use((chain) => chain.checkpoint(orgId))
  if (Option.isSome(previous) && previous.value.seq >= throughSeq) return 0
  const throughHash = yield* Effect.orDie(Effect.fromOption(yield* store.hashAt(orgId, throughSeq)))
  const purged = yield* store.purge({ orgId, throughSeq, throughHash, archivedKey })
  yield* audit.record({
    orgId,
    type: "audit.purged",
    actor: systemActor("cron"),
    target: null,
    data: { throughSeq, throughHash, archivedKey, purged, retentionDays, cutoff: DateTime.formatIso(cutoff) }
  })
  return purged
})

/** Nightly: purge every org past its retention. One org failing does not stop the others. */
export const purgeExpiredAudit = Effect.fn("audit.purgeExpired")(function*() {
  const orgs = yield* AuditRetentionStore.use((store) => store.orgs())
  const purged = yield* Effect.forEach(orgs, ({ orgId, auditRetentionDays }) =>
    purgeOrgAudit(orgId, auditRetentionDays).pipe(
      Effect.catchCause((cause) => Effect.as(Effect.logError("audit purge failed", { orgId, cause }), 0))
    ), { concurrency: 4 })
  return purged.reduce((sum, n) => sum + n, 0)
})

import type { OrgId } from "@pc/domain"
import { DateTime, Effect, Option, Schema, Stream } from "effect"
import { AuditArchive } from "../platform/archive"
import { AuditArchiveCursors } from "./archive-cursors"
import { type ArchiveDay, archiveDay, archiveKey, ArchiveMetadata, archiveMetadataOf, covers } from "./archive-key"
import { toNdjson } from "./ndjson"
import { AuditRetentionStore } from "./retention-store"
import { AuditStore } from "./store"

/** Bounds one night per org; a backlog (missed nights, a new deployment) drains over the following nights. */
export const MaxDaysPerNight = 31
/** Events per D1 page of a day export; the archive buffers at most one R2 part beyond this. */
export const ExportPageSize = 500

const decodeMetadata = Schema.decodeUnknownOption(ArchiveMetadata)

export type DayOutcome = "archived" | "already_archived" | "empty" | "partially_purged"

/**
 * Writes one org-day to R2 unless an archive already covers it. A missing archive, or one that lacks events
 * that arrived late, is (re)written from D1, streamed page by page up to the last seq read at the start.
 */
export const archiveOrgDay = Effect.fn("audit.archiveOrgDay")(function*(orgId: OrgId, day: ArchiveDay) {
  const archive = yield* AuditArchive
  const store = yield* AuditStore
  yield* Effect.annotateCurrentSpan({ "org.id": orgId, "audit.day": day.date })
  const range = yield* AuditRetentionStore.use((retention) => retention.dayRange(orgId, day.from, day.to))
  if (Option.isNone(range)) return "empty" satisfies DayOutcome
  const key = archiveKey(orgId, day)
  const existing = Option.flatMap(yield* archive.metadata(key), decodeMetadata)
  if (covers(existing, range.value)) return "already_archived" satisfies DayOutcome
  // Rewriting a day whose earlier events were already purged from D1 would drop them from the archive too.
  if (Option.isSome(existing) && existing.value.firstSeq < range.value.firstSeq) {
    yield* Effect.logError("audit archive needs manual repair: day partially purged", { alert: "audit.archive_repair", orgId, key })
    return "partially_purged" satisfies DayOutcome
  }
  const slice = { from: day.from, to: day.to, throughSeq: range.value.lastSeq }
  const pages = Stream.paginate(0, (afterSeq: number) =>
    Effect.gen(function*() {
      const events = yield* store.dayPage(orgId, slice, afterSeq, ExportPageSize)
      const last = events.at(-1)
      const next = last === undefined || events.length < ExportPageSize ? Option.none() : Option.some(last.seq)
      return [[yield* toNdjson(events)], next] as const
    }))
  yield* archive.upload(key, pages, archiveMetadataOf(range.value))
  return "archived" satisfies DayOutcome
})

/** Archives one org's complete days after its cursor, oldest first; the cursor only moves past a day once it is in R2. */
export const archiveOrgBacklog = Effect.fn("audit.archiveOrgBacklog")(function*(orgId: OrgId, today: string) {
  const cursors = yield* AuditArchiveCursors
  const days = yield* cursors.eventDays(orgId, yield* cursors.throughDay(orgId), today, MaxDaysPerNight)
  let archived = 0
  for (const date of days) {
    const outcome = yield* archiveOrgDay(orgId, archiveDay(DateTime.makeUnsafe(`${date}T00:00:00Z`))).pipe(
      Effect.catchTag("ArchiveUnavailable", (error) => Effect.as(Effect.logError("audit day archive failed", { orgId, date, error }), "failed"))
    )
    // Later days wait for this one, so the cursor never skips a day that is not in R2.
    if (outcome === "failed") break
    if (outcome === "archived") archived++
    yield* cursors.advance(orgId, date)
  }
  return archived
})

/** Nightly: every org's unarchived complete days. One org failing is logged and does not stop the others. */
export const archiveAuditBacklog = Effect.fn("audit.archiveBacklog")(function*() {
  const today = DateTime.formatIso(DateTime.startOf(yield* DateTime.now, "day")).slice(0, 10)
  const orgs = yield* AuditRetentionStore.use((store) => store.orgs())
  const archived = yield* Effect.forEach(orgs, ({ orgId }) =>
    archiveOrgBacklog(orgId, today).pipe(
      Effect.catchCause((cause) => Effect.as(Effect.logError("audit archive failed", { orgId, cause }), 0))
    ), { concurrency: 4 })
  return archived.reduce((sum, n) => sum + n, 0)
})

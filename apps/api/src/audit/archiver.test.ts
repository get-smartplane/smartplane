import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { TestDatabase } from "../testing/database"
import { auditEvent, now, orgId } from "../testing/fixtures"
import { type ArchivedObject, memoryArchive } from "../testing/memory-archive"
import { seedOrg, selectRows } from "../testing/seed"
import { AuditArchiveCursors } from "./archive-cursors"
import { archiveDay } from "./archive-key"
import { archiveAuditBacklog, archiveOrgDay, ExportPageSize, MaxDaysPerNight } from "./archiver"
import { AuditChain } from "./chain-writer"
import { AuditRetentionStore } from "./retention-store"
import { AuditStore } from "./store"

const layer = (objects: Map<string, ArchivedObject>, refused: ReadonlySet<string> = new Set()) =>
  Layer.mergeAll(AuditChain.layer, AuditRetentionStore.layer, AuditArchiveCursors.layer).pipe(
    Layer.provideMerge(AuditStore.layer),
    Layer.provideMerge(memoryArchive(objects, refused)),
    Layer.provideMerge(TestDatabase)
  )

const at = (iso: string) => DateTime.makeUnsafe(iso)
const keyOf = (date: string) => `org=${orgId}/day=${date}/events.ndjson`
let next = 0
const append = (...times: ReadonlyArray<string>) =>
  AuditChain.use((chain) => chain.append(orgId, times.map((time) => auditEvent(++next, { occurredAt: at(time) }))))
const cursor = selectRows("SELECT through_day FROM audit_archive_cursors").pipe(Effect.map((rows) => rows[0]?.throughDay))
const linesOf = (object: ArchivedObject | undefined) => object?.body.trimEnd().split("\n").length ?? 0

const setup = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
})

describe("nightly audit archive", () => {
  it.effect("archives every complete day since the last run, never today, and resumes from its cursor", () => {
    const objects = new Map<string, ArchivedObject>()
    return Effect.gen(function*() {
      yield* setup
      // The cron missed 10-11 to 10-14: all of them are caught up in one night.
      yield* append("2026-10-10T08:00:00Z", "2026-10-10T09:00:00Z", "2026-10-12T08:00:00Z", "2026-10-14T23:59:59Z", "2026-10-15T01:00:00Z")
      assert.strictEqual(yield* archiveAuditBacklog(), 3)
      assert.deepStrictEqual([...objects.keys()].sort(), [keyOf("2026-10-10"), keyOf("2026-10-12"), keyOf("2026-10-14")])
      assert.strictEqual(linesOf(objects.get(keyOf("2026-10-10"))), 2)
      assert.deepStrictEqual(objects.get(keyOf("2026-10-10"))?.metadata.firstSeq, "1")
      assert.strictEqual(yield* cursor, "2026-10-14")

      assert.strictEqual(yield* archiveAuditBacklog(), 0, "nothing new: the cursor skips archived days")
      yield* TestClock.adjust("1 day")
      assert.strictEqual(yield* archiveAuditBacklog(), 1)
      assert.isTrue(objects.has(keyOf("2026-10-15")))
    }).pipe(Effect.provide(layer(objects)))
  })

  it.effect("drains a long backlog over several nights, a capped number of days each", () => {
    const objects = new Map<string, ArchivedObject>()
    return Effect.gen(function*() {
      yield* setup
      const days = Array.from({ length: MaxDaysPerNight + 5 }, (_, n) => DateTime.formatIso(DateTime.subtract(at("2026-10-14T12:00:00Z"), { days: n })))
      yield* append(...days.reverse())
      assert.strictEqual(yield* archiveAuditBacklog(), MaxDaysPerNight)
      assert.strictEqual(yield* archiveAuditBacklog(), 5)
      assert.strictEqual(objects.size, MaxDaysPerNight + 5)
    }).pipe(Effect.provide(layer(objects)))
  })

  it.effect("streams a busy day page by page and keeps the cursor before a day that failed", () => {
    const objects = new Map<string, ArchivedObject>()
    const refused = new Set([keyOf("2026-10-13")])
    return Effect.gen(function*() {
      yield* setup
      const busy = Array.from({ length: ExportPageSize * 2 + 7 }, (_, n) => DateTime.formatIso(DateTime.add(at("2026-10-12T00:00:00Z"), { seconds: n })))
      yield* append(...busy, "2026-10-13T10:00:00Z", "2026-10-14T10:00:00Z")
      assert.strictEqual(yield* archiveAuditBacklog(), 1, "10-12 written; 10-13 failed, so 10-14 waits")
      const archived = objects.get(keyOf("2026-10-12"))
      assert.strictEqual(archived?.chunks, 3)
      assert.strictEqual(linesOf(archived), ExportPageSize * 2 + 7)
      assert.strictEqual(yield* cursor, "2026-10-12")
      refused.delete(keyOf("2026-10-13"))
      assert.strictEqual(yield* archiveAuditBacklog(), 2)
      assert.strictEqual(yield* cursor, "2026-10-14")
    }).pipe(Effect.provide(layer(objects, refused)))
  })

  it.effect("re-archives a day whose archive is missing or lacks late events, and leaves a covering one alone", () => {
    const objects = new Map<string, ArchivedObject>()
    return Effect.gen(function*() {
      yield* setup
      yield* append("2026-10-12T08:00:00Z")
      const day = archiveDay(at("2026-10-12T00:00:00Z"))
      assert.strictEqual(yield* archiveOrgDay(orgId, day), "archived")
      assert.strictEqual(yield* archiveOrgDay(orgId, day), "already_archived")
      yield* append("2026-10-12T09:00:00Z")
      assert.strictEqual(yield* archiveOrgDay(orgId, day), "archived", "a late event makes the archive stale")
      assert.strictEqual(linesOf(objects.get(keyOf("2026-10-12"))), 2)
      objects.clear()
      assert.strictEqual(yield* archiveOrgDay(orgId, day), "archived", "a missing archive is rewritten")
    }).pipe(Effect.provide(layer(objects)))
  })
})

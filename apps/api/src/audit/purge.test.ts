import { assert, describe, it } from "@effect/vitest"
import type { AuditEvent } from "@pc/domain"
import { DateTime, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { TestDatabase } from "../testing/database"
import { auditEvent, now, orgId } from "../testing/fixtures"
import { type ArchivedObject, memoryArchive } from "../testing/memory-archive"
import { memoryAuditQueue, seedOrg, selectRows } from "../testing/seed"
import { archiveDay } from "./archive-key"
import { archiveOrgDay } from "./archiver"
import { AuditLog } from "./audit-log"
import { AuditChain } from "./chain-writer"
import { purgeOrgAudit } from "./purge"
import { AuditRetentionStore } from "./retention-store"
import { AuditStore } from "./store"

const dayA = DateTime.makeUnsafe("2025-01-01T10:00:00Z")
const dayB = DateTime.makeUnsafe("2025-01-02T10:00:00Z")
const recent = DateTime.makeUnsafe("2026-10-14T10:00:00Z")

const layer = (objects: Map<string, ArchivedObject>, emitted: Array<AuditEvent>, refused: ReadonlySet<string> = new Set()) =>
  Layer.mergeAll(AuditChain.layer, AuditRetentionStore.layer, AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(emitted)))).pipe(
    Layer.provideMerge(AuditStore.layer),
    Layer.provideMerge(memoryArchive(objects, refused)),
    Layer.provideMerge(TestDatabase)
  )

/** Appends events in this order; `at` is each event's occurredAt. */
const append = (...at: ReadonlyArray<DateTime.Utc>) =>
  AuditChain.use((chain) => chain.append(orgId, at.map((occurredAt, index) => auditEvent(index + 1, { occurredAt }))))

const archive = (...days: ReadonlyArray<DateTime.Utc>) => Effect.forEach(days, (day) => archiveOrgDay(orgId, archiveDay(day)), { discard: true })
const dayBKey = `org=${orgId}/day=2025-01-02/events.ndjson`
const seqs = selectRows("SELECT seq FROM audit_events ORDER BY seq").pipe(Effect.map((rows) => rows.map((row) => row.seq)))
const purge = purgeOrgAudit(orgId, 365)
const verify = AuditChain.use((chain) => chain.verify(orgId, 1))

const setup = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* append(dayA, dayA, dayA, dayB, dayB, recent, recent)
})

describe("audit retention purge", () => {
  it.effect("refuses to purge a day it cannot archive", () => {
    const objects = new Map<string, ArchivedObject>()
    const emitted: Array<AuditEvent> = []
    const refused = new Set([`org=${orgId}/day=2025-01-01/events.ndjson`])
    return Effect.gen(function*() {
      yield* setup
      assert.strictEqual(yield* purge, 0)
      assert.deepStrictEqual(yield* seqs, [1, 2, 3, 4, 5, 6, 7])
      assert.strictEqual(emitted.length, 0)
    }).pipe(Effect.provide(layer(objects, emitted, refused)))
  })

  it.effect("re-archives a day whose archive is missing or stale before purging it", () => {
    const objects = new Map<string, ArchivedObject>()
    const emitted: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* setup
      yield* archive(dayA)
      const key = `org=${orgId}/day=2025-01-01/events.ndjson`
      const archived = objects.get(key)
      if (archived === undefined) return assert.fail("day A was not archived")
      objects.set(key, { ...archived, metadata: { ...archived.metadata, lastHash: "f".repeat(64) } })
      assert.strictEqual(yield* purge, 5, "day A is rewritten and day B, never archived, is archived")
      assert.strictEqual(objects.get(key)?.metadata.lastHash, archived.metadata.lastHash)
      assert.isTrue(objects.has(dayBKey))
      assert.strictEqual(emitted[0]?.type, "audit.purged")
    }).pipe(Effect.provide(layer(objects, emitted)))
  })

  it.effect("purges archived days past retention, records a checkpoint and audits the purge", () => {
    const emitted: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* setup
      yield* archive(dayA, dayB, recent)
      assert.strictEqual(yield* purge, 5)
      assert.deepStrictEqual(yield* seqs, [6, 7])
      const [checkpoint] = yield* selectRows("SELECT through_seq, archived_key FROM audit_purge_checkpoints")
      assert.strictEqual(checkpoint?.throughSeq, 5)
      assert.strictEqual(checkpoint?.archivedKey, `org=${orgId}/day=2025-01-02/events.ndjson`)
      assert.strictEqual(emitted[0]?.type, "audit.purged")
      assert.strictEqual(emitted[0]?.data.throughSeq, 5)
      assert.strictEqual(yield* purge, 0, "a second run has nothing left to purge")
    }).pipe(Effect.provide(layer(new Map(), emitted)))
  })

  it.effect("stops at the first day it cannot archive so the purge stays a contiguous prefix", () =>
    Effect.gen(function*() {
      yield* setup
      yield* archive(dayA)
      assert.strictEqual(yield* purge, 3)
      assert.deepStrictEqual(yield* seqs, [4, 5, 6, 7])
    }).pipe(Effect.provide(layer(new Map(), [], new Set([dayBKey])))))

  it.effect("never purges past an event of a later day that was chained earlier", () => {
    const refused = new Set([dayBKey])
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      // seq 3 belongs to day B but arrived before day A's last event (seq 4).
      yield* append(dayA, dayA, dayB, dayA, recent)
      yield* archive(dayA)
      assert.strictEqual(yield* purge, 2)
      assert.deepStrictEqual(yield* seqs, [3, 4, 5])
      refused.delete(dayBKey)
      yield* archive(dayB)
      assert.strictEqual(yield* purge, 2, "day A's remaining row is still covered by its archive")
      assert.deepStrictEqual(yield* seqs, [5])
    }).pipe(Effect.provide(layer(new Map(), [], refused)))
  })

  it.effect("verifies the remaining chain from the checkpoint and keeps appending after it", () =>
    Effect.gen(function*() {
      yield* setup
      yield* archive(dayA, dayB)
      yield* purge
      assert.deepStrictEqual(yield* verify, { _tag: "Intact", fromSeq: 6, checked: 2 })
      yield* AuditChain.use((chain) => chain.append(orgId, [auditEvent(99, { occurredAt: now })]))
      assert.deepStrictEqual(yield* verify, { _tag: "Intact", fromSeq: 6, checked: 3 })
      yield* selectRows("DROP TRIGGER audit_events_no_update")
      yield* selectRows("UPDATE audit_events SET prev_hash = ? WHERE seq = 6", "0".repeat(64))
      assert.deepStrictEqual(yield* verify, { _tag: "Broken", fromSeq: 6, checked: 0, at: 6 })
    }).pipe(Effect.provide(layer(new Map(), []))))

  it.effect("continues the chain from the checkpoint when every stored event was purged", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      yield* append(dayA, dayA)
      yield* archive(dayA)
      assert.strictEqual(yield* purge, 2)
      yield* AuditChain.use((chain) => chain.append(orgId, [auditEvent(3, { occurredAt: now })]))
      assert.deepStrictEqual(yield* seqs, [3])
      assert.deepStrictEqual(yield* verify, { _tag: "Intact", fromSeq: 3, checked: 1 })
    }).pipe(Effect.provide(layer(new Map(), []))))

  it.effect("lets the database delete only rows covered by a valid checkpoint", () =>
    Effect.gen(function*() {
      yield* setup
      const refused = (query: string, ...params: Array<unknown>) =>
        selectRows(query, ...params).pipe(Effect.exit, Effect.map((exit) => exit._tag === "Failure"))
      assert.isTrue(yield* refused("DELETE FROM audit_events WHERE seq = 1"), "delete without a checkpoint")
      const insert = "INSERT INTO audit_purge_checkpoints VALUES (?, ?, ?, 'key', '2026-10-15T00:00:00Z')"
      assert.isTrue(yield* refused(insert, orgId, 2, "f".repeat(64)), "checkpoint with a hash that is not stored")
      const [row] = yield* selectRows("SELECT hash FROM audit_events WHERE seq = 2")
      assert.isFalse(yield* refused(insert, orgId, 2, row?.hash))
      assert.isTrue(yield* refused("DELETE FROM audit_events WHERE seq = 3"), "delete beyond the checkpoint")
      assert.isFalse(yield* refused("DELETE FROM audit_events WHERE seq <= 2"))
      const [first] = yield* selectRows("SELECT hash FROM audit_events WHERE seq = 3")
      assert.isTrue(yield* refused(insert, orgId, 1, first?.hash), "checkpoint moving backwards")
      assert.isTrue(yield* refused("DELETE FROM audit_purge_checkpoints"), "checkpoints are append-only")
    }).pipe(Effect.provide(layer(new Map(), []))))
})

import { assert, describe, it } from "@effect/vitest"
import type { ChainedAuditEvent } from "@pc/domain"
import { Effect, Exit, Layer } from "effect"
import { TestDatabase } from "../testing/database"
import { auditEvent, orgId } from "../testing/fixtures"
import { memoryAuditStore } from "../testing/memory-audit-store"
import { seedOrg, selectRows } from "../testing/seed"
import { chain, emptyHead } from "./chain"
import { AuditChain } from "./chain-writer"
import { AuditStore } from "./store"

const append = (events: ReadonlyArray<number>) => AuditChain.use((writer) => writer.append(orgId, events.map((n) => auditEvent(n))))
const verify = AuditChain.use((writer) => writer.verify(orgId, 1))

describe("batched chain append (memory store)", () => {
  const over = (rows: Array<ChainedAuditEvent>, failNextInsert = { pending: false }) =>
    AuditChain.layer.pipe(Layer.provide(memoryAuditStore(rows, failNextInsert)))

  it.effect("keeps the first of duplicate ids within a batch and skips stored ones", () => {
    const rows: Array<ChainedAuditEvent> = []
    return Effect.gen(function*() {
      assert.strictEqual(yield* append([1, 2, 2, 3, 1]), 3)
      assert.strictEqual(yield* append([3, 4, 2]), 1, "only event 4 is new")
      assert.deepStrictEqual(rows.map((row) => [row.id, row.seq]), [[auditEvent(1).id, 1], [auditEvent(2).id, 2], [auditEvent(3).id, 3], [auditEvent(4).id, 4]])
      assert.deepStrictEqual(yield* verify, { _tag: "Intact", fromSeq: 1, checked: 4 })
    }).pipe(Effect.provide(over(rows)))
  })

  it.effect("a failed batch writes nothing, and its retry chains the same events gap-free", () => {
    const rows: Array<ChainedAuditEvent> = []
    const failNextInsert = { pending: false }
    return Effect.gen(function*() {
      yield* append([1, 2])
      failNextInsert.pending = true
      const failed = yield* Effect.exit(append([3, 4, 5]))
      assert.isTrue(Exit.isFailure(failed))
      assert.strictEqual(rows.length, 2)
      assert.strictEqual(yield* append([3, 4, 5]), 3)
      assert.deepStrictEqual(rows.map((row) => row.seq), [1, 2, 3, 4, 5])
      assert.deepStrictEqual(yield* verify, { _tag: "Intact", fromSeq: 1, checked: 5 })
    }).pipe(Effect.provide(over(rows, failNextInsert)))
  })
})

describe("batched chain append (D1)", () => {
  const layer = AuditChain.layer.pipe(Layer.provideMerge(AuditStore.layer), Layer.provideMerge(TestDatabase))
  const seqs = selectRows("SELECT seq FROM audit_events ORDER BY seq").pipe(Effect.map((rows) => rows.map((row) => row.seq)))

  it.effect("writes a batch atomically and is idempotent on redelivery", () =>
    Effect.gen(function*() {
      yield* seedOrg
      assert.strictEqual(yield* append([1, 2, 3]), 3)
      assert.strictEqual(yield* append([2, 3, 4]), 1)
      assert.deepStrictEqual(yield* seqs, [1, 2, 3, 4])
      assert.deepStrictEqual(yield* verify, { _tag: "Intact", fromSeq: 1, checked: 4 })
    }).pipe(Effect.provide(layer)))

  it.effect("the database refuses a writer working from a stale head, so racing batches cannot fork the chain", () =>
    Effect.gen(function*() {
      yield* seedOrg
      yield* append([1, 2])
      const store = yield* AuditStore
      // A second writer that read the head before events 1 and 2 were stored.
      const stale = yield* chain(emptyHead, auditEvent(9))
      assert.isTrue(Exit.isFailure(yield* Effect.exit(store.insertAll([stale]))), "seq 1 is taken")
      const [head] = yield* selectRows("SELECT seq, hash FROM audit_events WHERE seq = 2")
      const forged = yield* chain({ seq: 2, hash: "f".repeat(64) }, auditEvent(10))
      assert.isTrue(Exit.isFailure(yield* Effect.exit(store.insertAll([forged]))), "a link to a hash that is not the head")
      const gap = yield* chain({ seq: 5, hash: String(head?.hash) }, auditEvent(11))
      assert.isTrue(Exit.isFailure(yield* Effect.exit(store.insertAll([gap]))), "a seq gap")
      const good = yield* chain({ seq: 2, hash: String(head?.hash) }, auditEvent(12))
      const afterBad = yield* chain({ seq: 3, hash: "e".repeat(64) }, auditEvent(13))
      assert.isTrue(Exit.isFailure(yield* Effect.exit(store.insertAll([good, afterBad]))), "one bad link fails the batch")
      assert.deepStrictEqual(yield* seqs, [1, 2], "nothing of the failed batch was kept")
      assert.strictEqual(yield* append([12]), 1)
      assert.deepStrictEqual(yield* verify, { _tag: "Intact", fromSeq: 1, checked: 3 })
    }).pipe(Effect.provide(layer)))

  it.effect("checks redelivered ids in chunks under D1's parameter limit", () =>
    Effect.gen(function*() {
      yield* seedOrg
      const many = Array.from({ length: 250 }, (_, n) => n + 1)
      assert.strictEqual(yield* append(many), 250)
      assert.strictEqual(yield* append(many), 0)
      assert.strictEqual((yield* seqs).length, 250)
    }).pipe(Effect.provide(layer)))
})

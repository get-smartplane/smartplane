import { assert, describe, it } from "@effect/vitest"
import type { ChainedAuditEvent } from "@pc/domain"
import { Effect, Layer } from "effect"
import { auditEvent, orgId } from "../testing/fixtures"
import { memoryAuditStore } from "../testing/memory-audit-store"
import { GenesisHash, verifyChain } from "./chain"
import { AuditChain } from "./chain-writer"

const chainOver = (rows: Array<ChainedAuditEvent>) => AuditChain.layer.pipe(Layer.provide(memoryAuditStore(rows)))

const appendFive = (rows: Array<ChainedAuditEvent>) =>
  AuditChain.use((chain) => chain.append(orgId, [1, 2, 3, 4, 5].map((n) => auditEvent(n)))).pipe(
    Effect.provide(chainOver(rows))
  )

const verify = (rows: Array<ChainedAuditEvent>, fromSeq = 1) =>
  AuditChain.use((chain) => chain.verify(orgId, fromSeq)).pipe(Effect.provide(chainOver(rows)))

describe("audit hash chain", () => {
  it.effect("links events from the genesis hash with gap-free seq", () =>
    Effect.gen(function*() {
      const rows: Array<ChainedAuditEvent> = []
      assert.strictEqual(yield* appendFive(rows), 5)
      assert.deepStrictEqual(rows.map((row) => row.seq), [1, 2, 3, 4, 5])
      assert.strictEqual(rows[0]?.prevHash, GenesisHash)
      for (const [index, row] of rows.entries()) {
        if (index > 0) assert.strictEqual(row.prevHash, rows[index - 1]?.hash)
      }
      assert.deepStrictEqual(yield* verify(rows), { _tag: "Intact", fromSeq: 1, checked: 5 })
    }))

  it.effect("is idempotent on redelivered events", () =>
    Effect.gen(function*() {
      const rows: Array<ChainedAuditEvent> = []
      yield* appendFive(rows)
      assert.strictEqual(yield* appendFive(rows), 0)
      assert.strictEqual(rows.length, 5)
      assert.strictEqual((yield* verify(rows))._tag, "Intact")
    }))

  it.effect("detects an edited event", () =>
    Effect.gen(function*() {
      const rows: Array<ChainedAuditEvent> = []
      yield* appendFive(rows)
      const third = rows[2]
      if (third === undefined) return assert.fail("missing event")
      rows[2] = { ...third, data: { ...third.data, n: 999 } }
      assert.deepStrictEqual(yield* verify(rows), { _tag: "Broken", fromSeq: 1, checked: 2, at: 3 })
    }))

  it.effect("detects a deleted event", () =>
    Effect.gen(function*() {
      const rows: Array<ChainedAuditEvent> = []
      yield* appendFive(rows)
      rows.splice(1, 1)
      assert.deepStrictEqual(yield* verify(rows), { _tag: "Broken", fromSeq: 1, checked: 1, at: 2 })
    }))

  it.effect("detects a rewritten chain that re-hashes an edited event but not its successors", () =>
    Effect.gen(function*() {
      const rows: Array<ChainedAuditEvent> = []
      yield* appendFive(rows)
      const forged: Array<ChainedAuditEvent> = []
      yield* AuditChain.use((chain) => chain.append(orgId, [auditEvent(1, { data: { forged: true } })])).pipe(
        Effect.provide(chainOver(forged))
      )
      const [first] = forged
      if (first === undefined) return assert.fail("missing forged event")
      rows[0] = first
      const result = yield* verify(rows)
      assert.deepStrictEqual(result, { _tag: "Broken", fromSeq: 1, checked: 1, at: 2 })
    }))

  it.effect("verifies a window that starts mid-chain", () =>
    Effect.gen(function*() {
      const rows: Array<ChainedAuditEvent> = []
      yield* appendFive(rows)
      assert.deepStrictEqual(yield* verify(rows, 3), { _tag: "Intact", fromSeq: 3, checked: 3 })
      assert.deepStrictEqual(yield* verifyChain(rows.slice(2), 2), { _tag: "Broken", fromSeq: 2, checked: 0, at: 2 })
    }))

  it.effect("hashes independently of JSON key order", () =>
    Effect.gen(function*() {
      const a: Array<ChainedAuditEvent> = []
      const b: Array<ChainedAuditEvent> = []
      yield* AuditChain.use((chain) => chain.append(orgId, [auditEvent(1, { data: { x: 1, y: 2 } })])).pipe(
        Effect.provide(chainOver(a))
      )
      yield* AuditChain.use((chain) => chain.append(orgId, [auditEvent(1, { data: { y: 2, x: 1 } })])).pipe(
        Effect.provide(chainOver(b))
      )
      assert.strictEqual(a[0]?.hash, b[0]?.hash)
    }))
})

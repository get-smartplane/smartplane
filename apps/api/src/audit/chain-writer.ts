import type { AuditEvent, ChainedAuditEvent, ChainVerification, OrgId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import type { SqlError } from "effect/sql/SqlError"
import { chain, emptyHead, verifyChain } from "./chain"
import { AuditStore } from "./store"

/** How many events one verify call re-hashes; callers page with `fromSeq`. */
export const VerifyWindow = 5000

/**
 * Appends events to an org's hash chain. Callers must serialise calls per org (the AuditLog Durable Object
 * does), because seq and prevHash are derived from the stored head.
 */
export class AuditChain extends Context.Service<AuditChain, {
  /** Returns how many events were newly written; fails (writing nothing) on a D1 error, so it can be retried. */
  readonly append: (orgId: OrgId, events: ReadonlyArray<AuditEvent>) => Effect.Effect<number, SqlError>
  readonly verify: (orgId: OrgId, fromSeq: number) => Effect.Effect<ChainVerification>
}>()("api/audit/AuditChain") {
  static readonly layer = Layer.effect(
    AuditChain,
    Effect.gen(function*() {
      const store = yield* AuditStore

      /**
       * The batch is chained in memory and written in one atomic D1 batch: one query for redelivered ids, one
       * for the head, one write. Duplicate ids within the batch keep their first occurrence.
       */
      const append = Effect.fn("AuditChain.append")(function*(orgId: OrgId, events: ReadonlyArray<AuditEvent>) {
        yield* Effect.annotateCurrentSpan({ "org.id": orgId, "audit.batch_size": events.length })
        // Events for another org would corrupt this chain; the consumer groups by org, so this is a bug.
        const foreign = events.find((event) => event.orgId !== orgId)
        if (foreign !== undefined) return yield* Effect.die(new Error(`event ${foreign.id} is not for org ${orgId}`))
        const stored = yield* store.existingIds(orgId, events.map((event) => event.id))
        const seen = new Set<string>(stored)
        const fresh: Array<AuditEvent> = []
        for (const event of events) {
          if (seen.has(event.id)) continue
          seen.add(event.id)
          fresh.push(event)
        }
        if (fresh.length === 0) return 0
        let head = Option.getOrElse(yield* store.head(orgId), () => emptyHead)
        const chained: Array<ChainedAuditEvent> = []
        for (const event of fresh) {
          const link = yield* chain(head, event)
          chained.push(link)
          head = { seq: link.seq, hash: link.hash }
        }
        yield* store.insertAll(chained)
        return chained.length
      })

      /** Purged events live only in R2, so verification starts after the latest checkpoint, anchored to its hash. */
      const verify = Effect.fn("AuditChain.verify")(function*(orgId: OrgId, fromSeq: number) {
        const checkpoint = yield* store.checkpoint(orgId)
        const start = Option.match(checkpoint, { onNone: () => fromSeq, onSome: ({ seq }) => Math.max(fromSeq, seq + 1) })
        const anchor = Option.isSome(checkpoint) && start === checkpoint.value.seq + 1 ? checkpoint.value.hash : undefined
        yield* Effect.annotateCurrentSpan({ "org.id": orgId, "audit.from_seq": start })
        return yield* verifyChain(yield* store.range(orgId, start, VerifyWindow), start, anchor)
      })

      return AuditChain.of({ append, verify })
    })
  )
}

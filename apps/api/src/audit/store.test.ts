import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, ResourceId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { TestDatabase } from "../testing/database"
import { auditEvent, orgId, userId } from "../testing/fixtures"
import { seedOrg } from "../testing/seed"
import { AuditChain } from "./chain-writer"
import { AuditStore } from "./store"

const layer = AuditChain.layer.pipe(Layer.provideMerge(AuditStore.layer), Layer.provideMerge(TestDatabase))
const page = (query: Parameters<AuditStore["Service"]["page"]>[1]) => AuditStore.use((store) => store.page(orgId, query))
const seqsOf = (events: ReadonlyArray<{ readonly seq: number }>) => events.map((event) => event.seq)

describe("audit log paging", () => {
  it.effect("pages back with `before` and forward with `after`, always newest first", () =>
    Effect.gen(function*() {
      yield* seedOrg
      yield* AuditChain.use((chain) => chain.append(orgId, [1, 2, 3, 4, 5].map((n) => auditEvent(n))))

      const newest = yield* page({ limit: 2 })
      assert.deepStrictEqual(seqsOf(newest.events), [5, 4])
      assert.strictEqual(newest.nextCursor, 4)
      assert.strictEqual(newest.prevCursor, 5)

      const older = yield* page({ limit: 2, before: 4 })
      assert.deepStrictEqual(seqsOf(older.events), [3, 2])

      const oldest = yield* page({ limit: 2, before: 2 })
      assert.deepStrictEqual(seqsOf(oldest.events), [1])
      assert.isNull(oldest.nextCursor)

      const newer = yield* page({ limit: 2, after: 1 })
      assert.deepStrictEqual(seqsOf(newer.events), [3, 2], "the events right after the cursor")
      assert.strictEqual(newer.prevCursor, 3)
      assert.strictEqual(newer.nextCursor, 2)

      const caughtUp = yield* page({ after: 5 })
      assert.deepStrictEqual(caughtUp.events, [])
      assert.strictEqual(caughtUp.prevCursor, 5, "polling keeps its place when nothing is new")
    }).pipe(Effect.provide(layer)))
})

describe("delivery summary", () => {
  it.effect("counts secret.delivered per resource and names the latest recipient", () =>
    Effect.gen(function*() {
      yield* seedOrg
      const delivered = (n: number, resourceId: string, actor: AuditEvent["actor"]) =>
        auditEvent(n, { type: "secret.delivered", target: { type: "resource", id: resourceId }, actor })
      const machine = { type: "system", id: "machine_token:mtk_billing01" } as const
      yield* AuditChain.use((chain) =>
        chain.append(orgId, [
          delivered(1, "res_stripe0001", { type: "user", id: userId }),
          delivered(2, "res_stripe0001", machine),
          auditEvent(3),
          delivered(4, "res_dburl00001", { type: "user", id: userId }),
          delivered(5, "res_stripe0001", machine)
        ])
      )
      const rows = yield* AuditStore.use((store) => store.deliveries(orgId))
      const byId = new Map(rows.map((row) => [row.resourceId, row]))
      assert.strictEqual(rows.length, 2)
      assert.strictEqual(byId.get(ResourceId.make("res_stripe0001"))?.count, 3)
      assert.deepStrictEqual(byId.get(ResourceId.make("res_stripe0001"))?.lastActor, machine)
      assert.strictEqual(byId.get(ResourceId.make("res_dburl00001"))?.count, 1)
    }).pipe(Effect.provide(layer)))
})

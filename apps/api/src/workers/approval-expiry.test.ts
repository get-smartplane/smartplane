import { assert, describe, it } from "@effect/vitest"
import type { AuditEvent, AuditEventType } from "@pc/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { AuditLog } from "../audit/audit-log"
import { TestDatabase } from "../testing/database"
import { activeGuard } from "../testing/delivery-world"
import { now, orgId, userId } from "../testing/fixtures"
import { recordingAudit, type Recorded } from "../testing/gateway-fakes"
import { insertRow, memoryAuditQueue, seedOrg, selectRows } from "../testing/seed"
import { expireApprovals } from "./approval-expiry"
import { isolated } from "./scheduled"

const approval = (id: string, expiresAt: string) =>
  insertRow("approvals", {
    id,
    orgId,
    guardId: "grd_expiry0001",
    requestedBy: JSON.stringify({ type: "user", id: userId }),
    requestedById: userId,
    request: "{}",
    requestHash: "h",
    status: "pending",
    createdAt: "2026-10-14T00:00:00.000Z",
    expiresAt
  })

const statuses = selectRows("SELECT id, status FROM approvals ORDER BY id").pipe(Effect.map((rows) => rows.map((row) => `${row.id}:${row.status}`)))

const seed = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* activeGuard("grd_expiry0001", "require_approval")
  yield* approval("apr_overdue001", "2026-10-15T11:00:00.000Z")
  yield* approval("apr_current001", "2026-10-15T13:00:00.000Z")
})

describe("approval expiry", () => {
  it.effect("records the lapse with an id derived from the approval, then marks it expired", () => {
    const sent: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      assert.strictEqual(yield* expireApprovals(), 1)
      assert.deepStrictEqual(yield* statuses, ["apr_current001:pending", "apr_overdue001:expired"])
      assert.deepStrictEqual(sent.map((event) => [event.type, event.target?.id]), [["approval.expired", "apr_overdue001"]])
    }).pipe(Effect.provide(Layer.merge(AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(sent))), TestDatabase)))
  })

  it.effect("leaves the approval pending when the audit log is down, so the next night records it", () => {
    const events: Array<Recorded> = []
    const down = new Set<AuditEventType>(["approval.expired"])
    return Effect.gen(function*() {
      yield* seed
      assert.strictEqual(yield* expireApprovals(), 0)
      assert.deepStrictEqual(yield* statuses, ["apr_current001:pending", "apr_overdue001:pending"])
      down.clear()
      assert.strictEqual(yield* expireApprovals(), 1)
      assert.deepStrictEqual(events.map((event) => event.type), ["approval.expired"])
    }).pipe(Effect.provide(Layer.merge(recordingAudit(events, down), TestDatabase)))
  })
})

describe("nightly step isolation", () => {
  it.effect("a failing or dying step reports -1 instead of failing the night", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* isolated("boom", Effect.die(new Error("r2 defect"))), -1)
      assert.strictEqual(yield* isolated("fail", Effect.fail("d1")), -1)
      assert.strictEqual(yield* isolated("ok", Effect.succeed(3)), 3)
    }))
})

import { ApprovalId, GuardId, OrgId } from "@pc/domain"
import { DateTime, Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { systemActor } from "../audit/actor"
import { AuditLog } from "../audit/audit-log"
import { derivedEventId } from "../audit/derived-id"
import { decodeRows } from "../platform/sql"

const Overdue = Schema.Struct({ id: ApprovalId, orgId: OrgId, guardId: GuardId })
type Overdue = typeof Overdue.Type

/** Bounds one night; a backlog drains over the following nights. */
const MaxPerRun = 500

/**
 * The event is recorded before the status flips, with an id derived from the approval: a failure after the
 * event leaves the approval pending, the next run re-records the same id (a no-op) and flips it. Expiry is a
 * fact of the clock (an overdue request can no longer be approved), so recording it first is never false.
 */
const expireOne = (approval: Overdue) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const audit = yield* AuditLog
    yield* audit.write({
      id: yield* derivedEventId(`approval.expired:${approval.id}`),
      orgId: approval.orgId,
      type: "approval.expired",
      actor: systemActor("cron"),
      target: { type: "approval", id: approval.id },
      data: { guardId: approval.guardId }
    })
    yield* sql`UPDATE approvals SET status = 'expired' WHERE id = ${approval.id} AND status = 'pending'`
    return true
  }).pipe(
    Effect.catchCause((cause) => Effect.as(Effect.logError("approval expiry failed", { approvalId: approval.id, cause }), false))
  )

/** Pending approvals past their window can no longer release an action; record that they lapsed. */
export const expireApprovals = Effect.fn("cron.expireApprovals")(function*() {
  const sql = yield* SqlClient.SqlClient
  const now = DateTime.formatIso(yield* DateTime.now)
  const overdue = yield* decodeRows(Overdue)(
    sql`SELECT id, org_id, guard_id FROM approvals WHERE status = 'pending' AND expires_at <= ${now} ORDER BY expires_at LIMIT ${MaxPerRun}`
  )
  const expired = yield* Effect.forEach(overdue, expireOne, { concurrency: 4 })
  return expired.filter(Boolean).length
})

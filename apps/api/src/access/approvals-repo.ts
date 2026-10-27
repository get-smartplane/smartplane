import { Actor, Approval, type ApprovalId, ApprovalRequest, type ApprovalStatus, type OrgId, type UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"

const ApprovalRow = Schema.toCodecJson(
  Schema.Struct({ ...Approval.fields, requestedBy: JsonColumn(Actor), request: JsonColumn(ApprovalRequest) })
).pipe(Schema.decodeTo(Approval))
const encodeApproval = encodeRow(ApprovalRow)

export class ApprovalsRepo extends Context.Service<ApprovalsRepo, {
  readonly pending: (orgId: OrgId) => Effect.Effect<ReadonlyArray<Approval>>
  readonly find: (orgId: OrgId, id: ApprovalId) => Effect.Effect<Option.Option<Approval>>
  readonly insert: (approval: Approval, requestHash: string) => Effect.Effect<void>
  /** Records a decision if the approval is still pending; false when someone else decided first. */
  readonly decide: (
    orgId: OrgId,
    id: ApprovalId,
    status: Extract<ApprovalStatus, "approved" | "rejected">,
    by: UserId,
    comment: string | null
  ) => Effect.Effect<boolean>
  /** The newest unexpired pending or approved request by `actorId` for the same action. */
  readonly forRequest: (orgId: OrgId, actorId: string, requestHash: string) => Effect.Effect<Option.Option<Approval>>
  /** Uses an approved, unexpired approval once (`approved` -> `consumed`); false when another call used it first. */
  readonly consume: (orgId: OrgId, id: ApprovalId) => Effect.Effect<boolean>
  /** Marks overdue pending approvals expired and returns them. */
  readonly expireOverdue: () => Effect.Effect<ReadonlyArray<Approval>>
}>()("api/access/ApprovalsRepo") {
  static readonly layer = Layer.effect(
    ApprovalsRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const columns = sql`id, org_id, guard_id, requested_by, request, status, decided_by, decided_at, comment, created_at, expires_at`
      const rows = decodeRows(ApprovalRow)
      const nowIso = Effect.map(DateTime.now, DateTime.formatIso)

      return ApprovalsRepo.of({
        pending: Effect.fn("ApprovalsRepo.pending")(function*(orgId: OrgId) {
          const now = yield* nowIso
          return yield* rows(
            sql`SELECT ${columns} FROM approvals WHERE org_id = ${orgId} AND status = 'pending' AND expires_at > ${now} ORDER BY created_at`
          )
        }),
        find: Effect.fn("ApprovalsRepo.find")((orgId: OrgId, id: ApprovalId) =>
          decodeFirst(ApprovalRow)(sql`SELECT ${columns} FROM approvals WHERE org_id = ${orgId} AND id = ${id}`)
        ),
        insert: Effect.fn("ApprovalsRepo.insert")(function*(approval: Approval, requestHash: string) {
          const row = { ...(yield* encodeApproval(approval)), requestedById: approval.requestedBy.id, requestHash }
          yield* sql`INSERT INTO approvals ${sql.insert(row)}`.pipe(Effect.orDie)
        }),
        decide: Effect.fn("ApprovalsRepo.decide")(function*(orgId, id, status, by, comment) {
          const now = yield* nowIso
          const decided = yield* sql`UPDATE approvals SET status = ${status}, decided_by = ${by}, decided_at = ${now}, comment = ${comment}
                                      WHERE org_id = ${orgId} AND id = ${id} AND status = 'pending' AND expires_at > ${now}
                                      RETURNING id`.pipe(Effect.orDie)
          return decided.length > 0
        }),
        forRequest: Effect.fn("ApprovalsRepo.forRequest")(function*(orgId: OrgId, actorId: string, requestHash: string) {
          const now = yield* nowIso
          return yield* decodeFirst(ApprovalRow)(
            sql`SELECT ${columns} FROM approvals
                 WHERE org_id = ${orgId} AND requested_by_id = ${actorId} AND request_hash = ${requestHash}
                   AND status IN ('pending', 'approved') AND expires_at > ${now}
                 ORDER BY created_at DESC LIMIT 1`
          )
        }),
        consume: Effect.fn("ApprovalsRepo.consume")(function*(orgId: OrgId, id: ApprovalId) {
          const now = yield* nowIso
          const consumed = yield* sql`UPDATE approvals SET status = 'consumed'
                                       WHERE org_id = ${orgId} AND id = ${id} AND status = 'approved' AND expires_at > ${now}
                                       RETURNING id`.pipe(Effect.orDie)
          return consumed.length > 0
        }),
        expireOverdue: Effect.fn("ApprovalsRepo.expireOverdue")(function*() {
          const now = yield* nowIso
          return yield* rows(
            sql`UPDATE approvals SET status = 'expired' WHERE status = 'pending' AND expires_at <= ${now} RETURNING ${columns}`
          )
        })
      })
    })
  )
}

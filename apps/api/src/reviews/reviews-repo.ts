import {
  AccessReview,
  type AccessReviewId,
  AccessReviewItem,
  type AccessReviewItemId,
  AccessReviewScope,
  type OrgId,
  ReviewedAccess,
  ReviewedMachineToken,
  type ReviewDecision,
  UserId
} from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"

const ReviewRow = Schema.toCodecJson(Schema.Struct({ ...AccessReview.fields, scope: JsonColumn(AccessReviewScope) })).pipe(
  Schema.decodeTo(AccessReview)
)
const ItemRow = Schema.toCodecJson(
  Schema.Struct({ ...AccessReviewItem.fields, access: JsonColumn(ReviewedAccess), beneficiaries: JsonColumn(Schema.Array(UserId)) })
).pipe(Schema.decodeTo(AccessReviewItem))
const MachineTokensColumn = JsonColumn(Schema.Array(ReviewedMachineToken))
const MachineTokensRow = Schema.Struct({ machineTokens: MachineTokensColumn })
const encodeMachineTokens = Schema.encodeEffect(MachineTokensColumn)
const encodeReview = encodeRow(ReviewRow)
const encodeItem = encodeRow(ItemRow)

/** D1 allows 100 bound parameters per statement; items have 9 columns. */
const ItemsPerInsert = 10

const changed = (rows: ReadonlyArray<unknown>) => rows.length > 0

/** Access review campaigns and their items. The 0003 triggers keep decisions final and closed reviews frozen. */
export class AccessReviewsRepo extends Context.Service<AccessReviewsRepo, {
  /** Inserts the campaign and its whole snapshot (items and machine tokens) atomically. */
  readonly insert: (
    review: AccessReview,
    items: ReadonlyArray<AccessReviewItem>,
    machineTokens?: ReadonlyArray<ReviewedMachineToken>
  ) => Effect.Effect<void>
  readonly machineTokens: (reviewId: AccessReviewId) => Effect.Effect<ReadonlyArray<ReviewedMachineToken>>
  readonly list: (orgId: OrgId) => Effect.Effect<ReadonlyArray<AccessReview>>
  readonly find: (orgId: OrgId, id: AccessReviewId) => Effect.Effect<Option.Option<AccessReview>>
  readonly items: (reviewId: AccessReviewId) => Effect.Effect<ReadonlyArray<AccessReviewItem>>
  readonly findItem: (reviewId: AccessReviewId, id: AccessReviewItemId) => Effect.Effect<Option.Option<AccessReviewItem>>
  /** Records a decision if the item is undecided and the review open; false when someone else decided first. */
  readonly decide: (
    orgId: OrgId,
    item: AccessReviewItem,
    decision: ReviewDecision,
    by: UserId,
    comment: string | null
  ) => Effect.Effect<boolean>
  readonly markApplied: (id: AccessReviewItemId) => Effect.Effect<void>
  /** Closes the review only if it is open and every item is decided. */
  readonly close: (orgId: OrgId, id: AccessReviewId, by: UserId) => Effect.Effect<boolean>
}>()("api/reviews/AccessReviewsRepo") {
  static readonly layer = Layer.effect(
    AccessReviewsRepo,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const select = sql`SELECT r.id, r.org_id, r.name, r.scope, r.status, r.due_at, r.created_by, r.created_at, r.closed_by, r.closed_at,
                                (SELECT COUNT(*) FROM access_review_items i WHERE i.review_id = r.id) AS item_count,
                                (SELECT COUNT(*) FROM access_review_items i WHERE i.review_id = r.id AND i.decision IS NOT NULL) AS decided_count
                           FROM access_reviews r`
      const items = sql`SELECT id, review_id, access, beneficiaries, decision, decided_by, decided_at, comment, applied_at
                          FROM access_review_items`
      const nowIso = Effect.map(DateTime.now, DateTime.formatIso)

      const insert = Effect.fn("AccessReviewsRepo.insert")(function*(
        review: AccessReview,
        reviewItems: ReadonlyArray<AccessReviewItem>,
        machineTokens: ReadonlyArray<ReviewedMachineToken> = []
      ) {
        const { itemCount: _items, decidedCount: _decided, ...fields } = yield* encodeReview(review)
        const row = { ...fields, machineTokens: yield* Effect.orDie(encodeMachineTokens(machineTokens)) }
        const rows = yield* Effect.forEach(reviewItems, encodeItem)
        const chunks = Array.from({ length: Math.ceil(rows.length / ItemsPerInsert) }, (_, index) =>
          rows.slice(index * ItemsPerInsert, (index + 1) * ItemsPerInsert))
        yield* sql.batch([
          sql`INSERT INTO access_reviews ${sql.insert(row)}`,
          ...chunks.map((chunk) => sql`INSERT INTO access_review_items ${sql.insert(chunk)}`)
        ]).pipe(Effect.orDie)
      })

      return AccessReviewsRepo.of({
        insert,
        list: Effect.fn("AccessReviewsRepo.list")((orgId: OrgId) =>
          decodeRows(ReviewRow)(sql`${select} WHERE r.org_id = ${orgId} ORDER BY r.created_at DESC`)
        ),
        find: Effect.fn("AccessReviewsRepo.find")((orgId: OrgId, id: AccessReviewId) =>
          decodeFirst(ReviewRow)(sql`${select} WHERE r.org_id = ${orgId} AND r.id = ${id}`)
        ),
        machineTokens: Effect.fn("AccessReviewsRepo.machineTokens")(function*(reviewId: AccessReviewId) {
          const row = yield* decodeFirst(MachineTokensRow)(sql`SELECT machine_tokens FROM access_reviews WHERE id = ${reviewId}`)
          return Option.match(row, { onNone: () => [], onSome: (found) => found.machineTokens })
        }),
        items: Effect.fn("AccessReviewsRepo.items")((reviewId: AccessReviewId) =>
          decodeRows(ItemRow)(sql`${items} WHERE review_id = ${reviewId} ORDER BY rowid`)
        ),
        findItem: Effect.fn("AccessReviewsRepo.findItem")((reviewId: AccessReviewId, id: AccessReviewItemId) =>
          decodeFirst(ItemRow)(sql`${items} WHERE review_id = ${reviewId} AND id = ${id}`)
        ),
        decide: Effect.fn("AccessReviewsRepo.decide")(function*(orgId, item, decision, by, comment) {
          const now = yield* nowIso
          return changed(
            yield* sql`UPDATE access_review_items SET decision = ${decision}, decided_by = ${by}, decided_at = ${now}, comment = ${comment}
                        WHERE id = ${item.id} AND decision IS NULL
                          AND review_id IN (SELECT id FROM access_reviews WHERE id = ${item.reviewId} AND org_id = ${orgId} AND status = 'open')
                        RETURNING id`.pipe(Effect.orDie)
          )
        }),
        markApplied: Effect.fn("AccessReviewsRepo.markApplied")(function*(id: AccessReviewItemId) {
          const now = yield* nowIso
          yield* sql`UPDATE access_review_items SET applied_at = ${now} WHERE id = ${id} AND applied_at IS NULL`.pipe(Effect.orDie)
        }),
        close: Effect.fn("AccessReviewsRepo.close")(function*(orgId: OrgId, id: AccessReviewId, by: UserId) {
          const now = yield* nowIso
          return changed(
            yield* sql`UPDATE access_reviews SET status = 'closed', closed_by = ${by}, closed_at = ${now}
                        WHERE id = ${id} AND org_id = ${orgId} AND status = 'open'
                          AND NOT EXISTS (SELECT 1 FROM access_review_items WHERE review_id = ${id} AND decision IS NULL)
                        RETURNING id`.pipe(Effect.orDie)
          )
        })
      })
    })
  )
}

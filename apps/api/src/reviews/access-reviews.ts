import {
  type AccessReview,
  type AccessReviewDetail,
  type AccessReviewId,
  type AccessReviewItem,
  type AccessReviewItemId,
  type AuditTarget,
  Conflict,
  type CreateAccessReview,
  type DecideReviewItem,
  Forbidden,
  NotFound,
  type Principal
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { ProjectsRepo } from "../org/projects-repo"
import { Ids } from "../platform/ids"
import { reviewCsv } from "./csv"
import { ReviewRevocation } from "./revocation"
import { AccessReviewsRepo } from "./reviews-repo"
import { snapshotItems } from "./snapshot"
import { AccessSnapshotSource } from "./snapshot-source"

type Failure = Forbidden | NotFound | Conflict

/** Periodic user access reviews (SOC 2 CC6). Every method requires `reviews:manage`. */
export class AccessReviews extends Context.Service<AccessReviews, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<AccessReview>, Forbidden>
  readonly create: (principal: Principal, input: CreateAccessReview) => Effect.Effect<AccessReview, Forbidden | NotFound>
  readonly get: (principal: Principal, id: AccessReviewId) => Effect.Effect<AccessReviewDetail, Forbidden | NotFound>
  readonly decide: (principal: Principal, id: AccessReviewId, itemId: AccessReviewItemId, input: DecideReviewItem) => Effect.Effect<AccessReviewItem, Failure>
  readonly close: (principal: Principal, id: AccessReviewId) => Effect.Effect<AccessReview, Failure>
  readonly export: (principal: Principal, id: AccessReviewId) => Effect.Effect<string, Failure>
}>()("api/reviews/AccessReviews") {
  static readonly layer = Layer.effect(
    AccessReviews,
    Effect.gen(function*() {
      const repo = yield* AccessReviewsRepo
      const source = yield* AccessSnapshotSource
      const projects = yield* ProjectsRepo
      const revocation = yield* ReviewRevocation
      const audit = yield* AuditLog

      const reviewer = (principal: Principal) =>
        Effect.andThen(requirePermission(principal, "reviews:manage"), requireUser(principal))
      const load = (principal: Principal, id: AccessReviewId) =>
        Effect.flatMap(repo.find(principal.orgId, id), Effect.fromOption).pipe(
          Effect.mapError(() => new NotFound({ entity: "access_review", id }))
        )
      const target = (id: AccessReviewId): AuditTarget => ({ type: "access_review", id })

      const create = Effect.fn("AccessReviews.create")(function*(principal: Principal, input: CreateAccessReview) {
        const user = yield* reviewer(principal)
        if (input.scope.type === "project" && Option.isNone(yield* projects.find(principal.orgId, input.scope.projectId))) {
          return yield* new NotFound({ entity: "project", id: input.scope.projectId })
        }
        const state = yield* source.read(principal.orgId, input.scope)
        const snapshot = snapshotItems(input.scope, state)
        const id = yield* Ids.accessReview
        const items = yield* Effect.forEach(snapshot, (item) =>
          Effect.map(Ids.accessReviewItem, (itemId): AccessReviewItem => ({
            ...item,
            id: itemId,
            reviewId: id,
            decision: null,
            decidedBy: null,
            decidedAt: null,
            comment: null,
            appliedAt: null
          })))
        const review: AccessReview = {
          id,
          orgId: principal.orgId,
          ...input,
          status: "open",
          createdBy: user.userId,
          createdAt: yield* DateTime.now,
          closedBy: null,
          closedAt: null,
          itemCount: items.length,
          decidedCount: 0
        }
        yield* repo.insert(review, items, state.machineTokens)
        yield* audit.by(principal, "access_review.created", target(id), {
          name: input.name,
          scope: input.scope,
          items: items.length,
          machineTokens: state.machineTokens.length
        })
        return review
      })

      const decide = Effect.fn("AccessReviews.decide")(
        function*(principal: Principal, id: AccessReviewId, itemId: AccessReviewItemId, input: DecideReviewItem) {
          const user = yield* reviewer(principal)
          const review = yield* load(principal, id)
          const item = yield* Effect.flatMap(repo.findItem(review.id, itemId), Effect.fromOption).pipe(
            Effect.mapError(() => new NotFound({ entity: "access_review_item", id: itemId }))
          )
          // Separation of duties: nobody attests to access they hold themselves.
          if (item.beneficiaries.includes(user.userId)) return yield* new Forbidden({ message: "you cannot review your own access" })
          if (review.status === "closed") return yield* new Conflict({ message: "the access review is closed" })
          if (input.decision === "revoke") yield* revocation.check(principal.orgId, item.access)
          if (!(yield* repo.decide(principal.orgId, item, input.decision, user.userId, input.comment ?? null))) {
            return yield* new Conflict({ message: "this item has already been decided" })
          }
          if (input.decision === "revoke") {
            yield* revocation.apply(principal, user.userId, review.id, item.access)
            yield* repo.markApplied(item.id)
          }
          yield* audit.by(principal, "access_review.item_decided", { type: "access_review_item", id: item.id }, {
            reviewId: review.id,
            decision: input.decision,
            access: item.access._tag === "Membership" ? { membershipId: item.access.membershipId } : { grantId: item.access.grantId }
          })
          return yield* Effect.orDie(Effect.flatMap(repo.findItem(review.id, itemId), Effect.fromOption))
        }
      )

      const close = Effect.fn("AccessReviews.close")(function*(principal: Principal, id: AccessReviewId) {
        const user = yield* reviewer(principal)
        const review = yield* load(principal, id)
        if (!(yield* repo.close(principal.orgId, id, user.userId))) {
          return yield* new Conflict({
            message: review.status === "closed" ? "the access review is already closed" : "every item must be decided before closing"
          })
        }
        const closed = yield* Effect.orDie(load(principal, id))
        yield* audit.by(principal, "access_review.closed", target(id), { items: closed.itemCount })
        return closed
      })

      const exportCsv = Effect.fn("AccessReviews.export")(function*(principal: Principal, id: AccessReviewId) {
        yield* reviewer(principal)
        const review = yield* load(principal, id)
        if (review.status !== "closed") return yield* new Conflict({ message: "close the access review before exporting evidence" })
        const items = yield* repo.items(id)
        const machineTokens = yield* repo.machineTokens(id)
        yield* audit.by(principal, "access_review.exported", target(id), { items: items.length, machineTokens: machineTokens.length })
        return reviewCsv(review, items, machineTokens)
      })

      return AccessReviews.of({
        list: Effect.fn("AccessReviews.list")(function*(principal: Principal) {
          yield* reviewer(principal)
          return yield* repo.list(principal.orgId)
        }),
        create,
        get: Effect.fn("AccessReviews.get")(function*(principal: Principal, id: AccessReviewId) {
          yield* reviewer(principal)
          const review = yield* load(principal, id)
          const detail: AccessReviewDetail = { review, items: yield* repo.items(id), machineTokens: yield* repo.machineTokens(id) }
          return detail
        }),
        decide,
        close,
        export: exportCsv
      })
    })
  )
}

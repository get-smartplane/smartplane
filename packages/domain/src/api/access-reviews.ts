import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import {
  AccessReview,
  AccessReviewDetail,
  AccessReviewItem,
  CreateAccessReview,
  DecideReviewItem
} from "../access/review"
import { Conflict, Forbidden, NotFound } from "../errors"
import { AccessReviewId, AccessReviewItemId } from "../ids"
import { Authentication } from "./security"

/** One row per item with the decision trail; for auditors' working papers. */
export const AccessReviewExport = Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/csv" }))

const params = { id: AccessReviewId }

/** Every endpoint requires `reviews:manage`. */
export class AccessReviewsApi extends HttpApiGroup.make("accessReviews")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(AccessReview), error: Forbidden }),
    /** Snapshots every active membership and grant in scope. */
    HttpApiEndpoint.post("create", "/", {
      payload: CreateAccessReview,
      success: AccessReview.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound]
    }),
    HttpApiEndpoint.get("get", "/:id", { params, success: AccessReviewDetail, error: [Forbidden, NotFound] }),
    /** Forbidden for your own access; Conflict when already decided, the review is closed or the revoke cannot apply. */
    HttpApiEndpoint.post("decide", "/:id/items/:itemId/decision", {
      params: { id: AccessReviewId, itemId: AccessReviewItemId },
      payload: DecideReviewItem,
      success: AccessReviewItem,
      error: [Forbidden, NotFound, Conflict]
    }),
    /** Conflict until every item is decided. */
    HttpApiEndpoint.post("close", "/:id/close", { params, success: AccessReview, error: [Forbidden, NotFound, Conflict] }),
    /** CSV evidence of a closed review; Conflict while it is open. */
    HttpApiEndpoint.get("export", "/:id/export", {
      params,
      success: AccessReviewExport,
      error: [Forbidden, NotFound, Conflict]
    })
  )
  .middleware(Authentication)
  .prefix("/access-reviews")
{}

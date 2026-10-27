import type { AccessReviewId, AccessReviewItemId, CreateAccessReview, DecideReviewItem } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const reviewsAtom = apiQuery(["reviews"], (api) => api.accessReviews.list())

export const reviewAtom = Atom.family((id: AccessReviewId) =>
  apiQuery(["reviews"], (api) => api.accessReviews.get({ params: { id } }))
)

export const createReviewAtom = apiMutation(["reviews", "audit"], (api, payload: CreateAccessReview) =>
  api.accessReviews.create({ payload })
)

interface Decision {
  readonly id: AccessReviewId
  readonly itemId: AccessReviewItemId
  readonly payload: DecideReviewItem
}

/** A revoke applies at once (a grant revoked, or a member offboarded), so everything it touches refreshes. */
export const decideItemAtom = apiMutation(
  ["reviews", "grants", "members", "tokens", "teams", "audit"],
  (api, { id, itemId, payload }: Decision) => api.accessReviews.decide({ params: { id, itemId }, payload })
)

export const closeReviewAtom = apiMutation(["reviews", "audit"], (api, id: AccessReviewId) =>
  api.accessReviews.close({ params: { id } })
)

/** Exporting evidence is itself audited. */
export const exportReviewAtom = apiMutation(["audit"], (api, id: AccessReviewId) => api.accessReviews.export({ params: { id } }))

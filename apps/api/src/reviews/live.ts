import { Layer } from "effect"
import { AccessReviews } from "./access-reviews"
import { ReviewRevocation } from "./revocation"
import { AccessSnapshotSource } from "./snapshot-source"

/** Access reviews with their private collaborators; needs the repositories, AuditLog and Offboarding. */
export const AccessReviewsLive = AccessReviews.layer.pipe(Layer.provide(Layer.mergeAll(ReviewRevocation.layer, AccessSnapshotSource.layer)))

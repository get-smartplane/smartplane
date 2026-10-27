import { AccessReviewId } from "@pc/domain"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { ReviewDetailPage } from "@/features/reviews/review-detail-page"

const decodeReviewId = Schema.decodeUnknownSync(AccessReviewId)

export const Route = createFileRoute("/_app/reviews/$reviewId")({
  params: {
    parse: (raw) => ({ reviewId: decodeReviewId(raw.reviewId) }),
    stringify: ({ reviewId }) => ({ reviewId })
  },
  component: function ReviewRoute() {
    return <ReviewDetailPage reviewId={Route.useParams().reviewId} />
  }
})

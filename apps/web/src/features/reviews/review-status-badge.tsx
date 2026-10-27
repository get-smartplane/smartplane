import type { AccessReview } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"
import { reviewStatus } from "./review-meta"

export function ReviewStatusBadge({ review }: { readonly review: AccessReview }) {
  const { label, tone } = reviewStatus(review)
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

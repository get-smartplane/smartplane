import type { AccessReview, ReviewDecision } from "@pc/domain"
import type { Tone } from "@/components/status/tone"
import { isPast } from "@/lib/format"

export const isOverdue = (review: AccessReview): boolean =>
  review.status === "open" && review.dueAt !== null && isPast(review.dueAt)

export const isComplete = (review: AccessReview): boolean => review.decidedCount === review.itemCount

/** Open waits on people (warning), overdue is a finding (danger), closed is settled evidence (neutral). */
export const reviewStatus = (review: AccessReview): { readonly label: string; readonly tone: Tone } =>
  review.status === "closed"
    ? { label: "Closed", tone: "neutral" }
    : isOverdue(review)
      ? { label: "Overdue", tone: "danger" }
      : { label: "Open", tone: "warning" }

export const decisionMeta: { readonly [D in ReviewDecision]: { readonly label: string; readonly tone: Tone } } = {
  keep: { label: "Kept", tone: "success" },
  revoke: { label: "Revoked", tone: "danger" }
}

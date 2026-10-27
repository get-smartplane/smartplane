import type { AccessReview } from "@pc/domain"
import { cn } from "@/lib/utils"
import { isComplete } from "./review-meta"

/** Decided over total, as a thin gauge with the count beside it. */
export function ReviewProgress({ review, className }: { readonly review: AccessReview; readonly className?: string }) {
  const share = review.itemCount === 0 ? 1 : review.decidedCount / review.itemCount
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={review.itemCount}
        aria-valuenow={review.decidedCount}
        aria-label="Items decided"
        className="h-1.5 w-20 overflow-hidden rounded-full bg-border"
      >
        <span
          className={cn("block h-full rounded-full", isComplete(review) ? "bg-success" : "bg-foreground/75")}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {review.decidedCount} / {review.itemCount}
      </span>
    </span>
  )
}

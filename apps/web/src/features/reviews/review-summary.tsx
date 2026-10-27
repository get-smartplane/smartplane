import type { ReactNode } from "react"
import type { AccessReview, AccessReviewItem } from "@pc/domain"
import { EntityName } from "@/components/status/entity-name"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isOverdue } from "./review-meta"
import { ReviewProgress } from "./review-progress"

interface ReviewSummaryProps {
  readonly review: AccessReview
  readonly items: ReadonlyArray<AccessReviewItem>
}

const Stat = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-sm font-medium">{children}</dd>
  </div>
)

/** Progress, outcome so far, and who opened (and closed) the campaign. */
export function ReviewSummary({ review, items }: ReviewSummaryProps) {
  const revoked = items.filter((item) => item.decision === "revoke").length
  const kept = items.filter((item) => item.decision === "keep").length
  return (
    <dl className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-4 md:grid-cols-5">
      <Stat label="Decided">
        <ReviewProgress review={review} />
      </Stat>
      <Stat label="Kept · revoked">
        <span className="tabular-nums">
          {kept} · <span className={cn(revoked > 0 && "text-danger-ink")}>{revoked}</span>
        </span>
      </Stat>
      <Stat label="Due">
        <span className={cn("tabular-nums", isOverdue(review) && "text-danger-ink")}>
          {review.dueAt === null ? "No due date" : formatDate(review.dueAt)}
        </span>
      </Stat>
      <Stat label={`Started ${formatDate(review.createdAt)} by`}>
        <EntityName entity={{ kind: "user", id: review.createdBy }} />
      </Stat>
      {review.closedBy !== null && review.closedAt !== null && (
        <Stat label={`Closed ${formatDate(review.closedAt)} by`}>
          <EntityName entity={{ kind: "user", id: review.closedBy }} />
        </Stat>
      )}
    </dl>
  )
}

import { Link } from "@tanstack/react-router"
import { ClipboardCheck } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { reviewsAtom } from "@/features/reviews/atoms"
import { isOverdue } from "@/features/reviews/review-meta"
import { formatDate } from "@/lib/format"
import { AttentionRow, attentionLinkClass } from "./attention-row"

export function ReviewRows() {
  const open = useQueryData(reviewsAtom, []).filter((review) => review.status === "open")
  return open.map((review) => (
    <li key={review.id}>
      <Link to="/reviews/$reviewId" params={{ reviewId: review.id }} className={attentionLinkClass}>
        <AttentionRow
          icon={ClipboardCheck}
          tone={isOverdue(review) ? "danger" : "warning"}
          title={review.name}
          detail={`${review.decidedCount} of ${review.itemCount} decided${review.dueAt ? ` · ${isOverdue(review) ? "was due" : "due"} ${formatDate(review.dueAt)}` : ""}`}
        />
      </Link>
    </li>
  ))
}

import type { AccessReview } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { TableFrame } from "@/components/layout/table-frame"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { isOverdue } from "./review-meta"
import { ReviewProgress } from "./review-progress"
import { ReviewStatusBadge } from "./review-status-badge"
import { ScopeLabel } from "./scope-label"

export function ReviewsTable({ reviews }: { readonly reviews: ReadonlyArray<AccessReview> }) {
  return (
    <TableFrame>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[38%]">Review</TableHead>
            <TableHead className="hidden md:table-cell">Progress</TableHead>
            <TableHead className="hidden sm:table-cell">Due</TableHead>
            <TableHead className="w-28">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((review) => (
            <TableRow key={review.id}>
              <TableCell>
                <Link to="/reviews/$reviewId" params={{ reviewId: review.id }} className="font-medium underline-offset-4 hover:underline">
                  {review.name}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <ScopeLabel scope={review.scope} />
                </p>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <ReviewProgress review={review} />
              </TableCell>
              <TableCell className="hidden tabular-nums sm:table-cell">
                {review.status === "closed" && review.closedAt !== null ? (
                  <span className="text-muted-foreground">Closed {formatDate(review.closedAt)}</span>
                ) : review.dueAt === null ? (
                  <span className="text-muted-foreground">No due date</span>
                ) : (
                  <span className={cn(isOverdue(review) && "text-danger-ink")}>{formatDate(review.dueAt)}</span>
                )}
              </TableCell>
              <TableCell>
                <ReviewStatusBadge review={review} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

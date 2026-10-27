import type { AccessReview } from "@pc/domain"
import { Lock } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMutation } from "@/lib/api/use-mutation"
import { closeReviewAtom } from "./atoms"
import { isComplete } from "./review-meta"

/** Closing seals the decisions and unlocks the CSV evidence; the API refuses it while items are undecided. */
export function CloseReviewButton({ review }: { readonly review: AccessReview }) {
  const close = useMutation(closeReviewAtom, { success: "Review closed" })
  const remaining = review.itemCount - review.decidedCount
  if (!isComplete(review)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button swallows pointer events, so the tooltip hangs off a wrapper. */}
          <span tabIndex={0}>
            <Button disabled>
              <Lock />
              Close review
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {remaining} {remaining === 1 ? "item still needs" : "items still need"} a decision
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <ConfirmDialog
      trigger={
        <Button>
          <Lock />
          Close review
        </Button>
      }
      title="Close this review?"
      description={<p>Every item has a decision. Closing seals the review and makes its CSV evidence available for export.</p>}
      confirmLabel="Close review"
      onConfirm={async () => (await close.execute(review.id))._tag === "Success"}
    />
  )
}

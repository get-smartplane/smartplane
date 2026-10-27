import type { AccessReview, AccessReviewItem } from "@pc/domain"
import { Check, X } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { EntityName } from "@/components/status/entity-name"
import { StatusText } from "@/components/status/status-badge"
import { Button } from "@/components/ui/button"
import { useMe } from "@/features/auth/me-context"
import { useMutation } from "@/lib/api/use-mutation"
import { formatDateTime, formatRelative } from "@/lib/format"
import { decideItemAtom } from "./atoms"
import { decisionMeta } from "./review-meta"
import { RevokeEffect } from "./revoke-effect"

function Decided({ item }: { readonly item: AccessReviewItem }) {
  if (item.decision === null) return null
  const { label, tone } = decisionMeta[item.decision]
  return (
    <span className="flex flex-col items-end gap-0.5 text-right">
      <StatusText tone={tone}>{label}</StatusText>
      <span className="inline-flex max-w-full items-baseline gap-1 text-xs text-muted-foreground">
        {item.decidedBy !== null && <EntityName entity={{ kind: "user", id: item.decidedBy }} />}
        {item.decidedAt !== null && <time title={formatDateTime(item.decidedAt)}>{formatRelative(item.decidedAt)}</time>}
      </span>
      {item.decision === "revoke" && item.appliedAt === null && <span className="text-xs text-warning-ink">Not applied yet</span>}
    </span>
  )
}

/** Keep or revoke one item. Beneficiaries cannot decide their own access (the API refuses it too). */
export function ItemDecision({ review, item }: { readonly review: AccessReview; readonly item: AccessReviewItem }) {
  const { principal } = useMe()
  const decide = useMutation(decideItemAtom, { success: "Decision recorded" })
  const { access } = item

  if (item.decision !== null) return <Decided item={item} />
  if (review.status === "closed") return <span className="text-xs text-muted-foreground">Not decided</span>

  const own = principal._tag === "User" && item.beneficiaries.includes(principal.userId)
  const run = (decision: "keep" | "revoke") => decide.execute({ id: review.id, itemId: item.id, payload: { decision } })

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex gap-1.5">
        <Button variant="outline" size="sm" disabled={own || decide.pending} onClick={() => void run("keep")}>
          <Check />
          Keep
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" className="hover:bg-destructive/10 hover:text-danger-ink" disabled={own || decide.pending}>
              <X />
              Revoke
            </Button>
          }
          title={access._tag === "Membership" ? "Offboard this member?" : "Revoke this grant?"}
          description={
            <>
              <RevokeEffect access={access} />
              <p>Decisions are final and recorded in the audit log.</p>
            </>
          }
          confirmLabel={access._tag === "Membership" ? "Offboard" : "Revoke"}
          destructive
          onConfirm={async () => (await run("revoke"))._tag === "Success"}
        />
      </span>
      {own && <span className="text-xs text-muted-foreground">You hold this access, so someone else decides.</span>}
    </span>
  )
}

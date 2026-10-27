import { PaperPlane } from "@/components/sky/paper-plane"
import { Panel } from "@/components/layout/panel"
import { useCan } from "@/features/auth/me-context"
import { ApprovalRows } from "./approval-rows"
import { DraftRuleRows } from "./draft-rule-rows"
import { ExpiringTokenRows } from "./expiring-token-rows"
import { ReviewRows } from "./review-rows"

/** Everything waiting on a person, most urgent first; a clear sky when nothing is. */
export function AttentionPanel() {
  const canDecide = useCan("approvals:decide")
  const canReview = useCan("reviews:manage")
  const canWriteRules = useCan("guards:manage")
  return (
    <Panel title="Needs attention">
      <div className="group">
        <ul className="flex flex-col divide-y divide-border/80">
          {canDecide && <ApprovalRows />}
          {canReview && <ReviewRows />}
          {canWriteRules && <DraftRuleRows />}
          <ExpiringTokenRows />
        </ul>
        <div className="hidden items-center gap-3 px-4 py-4 group-not-has-[li]:flex">
          <PaperPlane className="w-10 shrink-0" strokeWidth={4} />
          <p className="text-sm text-muted-foreground">Clear skies. Nothing is waiting on you.</p>
        </div>
      </div>
    </Panel>
  )
}

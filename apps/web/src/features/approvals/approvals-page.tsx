import { CircleCheckBig } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { ApprovalCard } from "./approval-card"
import { pendingApprovalsAtom } from "./atoms"

export function ApprovalsPage() {
  return (
    <Page>
      <PageHeader
        title="Approvals"
        description="Agent calls a rule paused until someone else says yes. Undecided requests expire."
      />
      <QueryView atom={pendingApprovalsAtom}>
        {(approvals) =>
          approvals.length === 0 ? (
            <EmptyState
              icon={CircleCheckBig}
              title="Nothing is waiting"
              description="When a rule set to “Hold for approval” pauses a call, it waits here until someone other than the requester decides."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </div>
          )
        }
      </QueryView>
    </Page>
  )
}

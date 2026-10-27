import { Link } from "@tanstack/react-router"
import { CircleCheckBig } from "lucide-react"
import { EntityName } from "@/components/status/entity-name"
import { useQueryData } from "@/components/query/use-query-data"
import { pendingApprovalsAtom } from "@/features/approvals/atoms"
import { formatRelative } from "@/lib/format"
import { AttentionRow, attentionLinkClass } from "./attention-row"

const shown = 3

export function ApprovalRows() {
  const approvals = useQueryData(pendingApprovalsAtom, [])
  const rest = approvals.length - shown
  return (
    <>
      {approvals.slice(0, shown).map((approval) => (
        <li key={approval.id}>
          <Link to="/approvals" className={attentionLinkClass}>
            <AttentionRow
              icon={CircleCheckBig}
              tone="warning"
              title={
                <span className="inline-flex min-w-0 max-w-full items-baseline gap-1.5">
                  <code className="shrink-0 text-[0.8125rem]">{approval.request.tool}</code>
                  <span className="text-muted-foreground">on</span>
                  <EntityName entity={{ kind: "resource", id: approval.request.resourceId }} />
                </span>
              }
              detail={`Waiting for approval · expires ${formatRelative(approval.expiresAt)}`}
            />
          </Link>
        </li>
      ))}
      {rest > 0 && (
        <li>
          <Link to="/approvals" className="block px-4 py-2 pl-14 text-xs font-semibold text-brand hover:underline">
            {rest} more waiting
          </Link>
        </li>
      )}
    </>
  )
}

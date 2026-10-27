import { useQueryData } from "@/components/query/use-query-data"
import { pendingApprovalsAtom } from "@/features/approvals/atoms"

/** How many held actions wait for a decision; nothing when none do. */
export function PendingBadge() {
  const count = useQueryData(pendingApprovalsAtom, []).length
  if (count === 0) return null
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-warning/25 px-1.5 text-[0.6875rem] font-semibold text-warning-ink tabular-nums group-data-[collapsible=icon]:hidden">
      {count}
      <span className="sr-only"> waiting</span>
    </span>
  )
}

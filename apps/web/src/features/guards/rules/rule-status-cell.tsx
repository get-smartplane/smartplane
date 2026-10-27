import type { Guard } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { ArrowRight, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GuardStatusBadge } from "../guard-status-badge"
import { VerifyInline } from "../verify/verify-inline"
import type { RowState } from "./row-state"

/**
 * A rule's state in the list: the live verify stage, what needs a person (marked, opens the rule), "Review &
 * activate" for a verified draft (never switched on from here), or the status badge.
 */
export function RuleStatusCell({ guard, state }: { readonly guard: Guard; readonly state: RowState }) {
  switch (state.kind) {
    case "verifying":
      return <VerifyInline run={state.run} />
    case "attention":
      return (
        <Link
          to="/guards/$guardId"
          params={{ guardId: guard.id }}
          className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-warning-ink underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          {state.label}
        </Link>
      )
    case "review":
      return (
        <Button asChild size="xs" variant="outline">
          <Link to="/guards/$guardId" params={{ guardId: guard.id }}>
            Review &amp; activate
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      )
    case "status":
      return <GuardStatusBadge status={guard.status} />
  }
}

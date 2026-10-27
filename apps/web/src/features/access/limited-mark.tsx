import type { Grant } from "@pc/domain"
import { Filter } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { GrantConditionsSummary } from "./grant-conditions"

/** A small "limited" tag in a matrix cell; the limits themselves open on hover or focus. */
export function LimitedMark({ grants }: { readonly grants: ReadonlyArray<Grant> }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="ml-2 inline-flex items-center gap-1 rounded-sm px-1 align-middle text-[0.6875rem] text-muted-foreground ring-1 ring-border outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
          <Filter className="size-3" />
          limited
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-80 flex-col gap-2 text-left">
        {grants.map((grant) => <GrantConditionsSummary key={grant.id} conditions={grant.conditions} />)}
      </TooltipContent>
    </Tooltip>
  )
}

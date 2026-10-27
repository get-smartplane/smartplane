import { useState } from "react"
import { cn } from "@/lib/utils"

interface ExpandableNamesProps {
  readonly names: ReadonlyArray<string>
  /** How many show before "+N more". */
  readonly visible?: number
  readonly className?: string
}

/** A few names as chips and "+N more" for the rest, so a count always comes with what it counts. */
export function ExpandableNames({ names, visible = 3, className }: ExpandableNamesProps) {
  const [expanded, setExpanded] = useState(false)
  const hidden = names.length - visible
  const shown = expanded || hidden <= 0 ? names : names.slice(0, visible)
  return (
    <ul className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((name) => (
        <li key={name} className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-foreground">
          {name}
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="rounded-sm px-1 py-0.5 text-xs font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {expanded ? "Show fewer" : `+${hidden} more`}
          </button>
        </li>
      )}
    </ul>
  )
}

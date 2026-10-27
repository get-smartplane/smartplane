import { ChevronRight } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface AdvancedOptionsProps {
  /** The current values in a few words, so nobody has to open it to know what they get. */
  readonly summary?: ReactNode
  /** Opens it, e.g. when a field inside has a validation error. */
  readonly forceOpen?: boolean
  readonly label?: string
  readonly children: ReactNode
}

/** Everything a form supports beyond the essentials, folded away behind sensible defaults. */
export function AdvancedOptions({ summary, forceOpen = false, label = "Advanced options", children }: AdvancedOptionsProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const shown = open || forceOpen
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/55 px-3 py-2.5">
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={id}
        onClick={() => setOpen(!shown)}
        className="flex w-full items-center gap-2 rounded-sm text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", shown && "rotate-90")} />
        <span className="font-semibold">{label}</span>
        {summary && !shown && <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{summary}</span>}
      </button>
      {shown && (
        <div id={id} className="flex animate-reveal flex-col gap-5 pb-1.5">
          {children}
        </div>
      )}
    </div>
  )
}

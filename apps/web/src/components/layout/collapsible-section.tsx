import { ChevronRight } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  readonly title: string
  readonly description: string
  readonly defaultOpen?: boolean
  readonly children: ReactNode
}

/** A page section that stays folded until needed, for settings touched once a year. */
export function CollapsibleSection({ title, description, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="flex flex-col gap-3">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="group flex items-start gap-2 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-[1.0625rem] leading-6 group-hover:underline group-focus-visible:underline">{title}</span>
          <span className="text-sm text-pretty text-muted-foreground">{description}</span>
        </span>
      </button>
      {open && (
        <div id={id} className="animate-reveal pl-6">
          {children}
        </div>
      )}
    </section>
  )
}

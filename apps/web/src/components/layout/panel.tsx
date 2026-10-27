import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PanelProps {
  readonly title: string
  /** Right side of the panel's header: a link to the full view or a small control. */
  readonly action?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}

/** A card with a slim titled header, for the overview's blocks and side columns. */
export function Panel({ title, action, children, className }: PanelProps) {
  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-4">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

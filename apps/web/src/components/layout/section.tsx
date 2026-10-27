import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SectionProps {
  /** An anchor other pages can link to. */
  readonly id?: string
  readonly title: string
  readonly description?: ReactNode
  /** Right-aligned beside the heading: a count, a link, a small action. */
  readonly aside?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}

/** A titled block inside a page. */
export function Section({ id, title, description, aside, children, className }: SectionProps) {
  return (
    <section id={id} className={cn("flex min-w-0 scroll-mt-16 flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-display text-[1.0625rem] leading-6">{title}</h2>
          {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

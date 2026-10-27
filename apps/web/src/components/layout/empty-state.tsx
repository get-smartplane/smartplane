import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { SkyEmblem } from "@/components/sky/sky-emblem"

interface EmptyStateProps {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  /** One primary action. */
  readonly action?: ReactNode
  /** A short tip under the action: where else this can come from. */
  readonly hint?: ReactNode
}

/** Says what will live here and how to start: a patch of sky, one sentence, one action. */
export function EmptyState({ icon, title, description, action, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border bg-card px-6 py-12 text-center">
      <SkyEmblem icon={icon} />
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="font-display text-lg leading-6">{title}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      </div>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
      {hint && <p className="max-w-sm text-xs text-pretty text-muted-foreground">{hint}</p>}
    </div>
  )
}

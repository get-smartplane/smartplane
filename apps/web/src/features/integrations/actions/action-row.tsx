import type { IntegrationAction } from "@pc/domain"
import { cn } from "@/lib/utils"
import { ActionBadges } from "./action-badges"

/** One action: its name, what it does, and the badges that decide whether to grant it. */
export function ActionRow({ action }: { readonly action: IntegrationAction }) {
  const muted = action.support.status !== "supported"
  return (
    <li className={cn("flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6", muted && "bg-muted/40")}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("font-medium", muted && "text-muted-foreground")}>{action.displayName}</span>
          <code className="text-xs text-muted-foreground">{action.name}</code>
        </span>
        {action.description && <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">{action.description}</p>}
        {action.support.status === "unsupported" && <p className="text-xs text-warning-ink">{action.support.reason}</p>}
      </div>
      <div className="shrink-0 sm:pt-0.5">
        <ActionBadges action={action} />
      </div>
    </li>
  )
}

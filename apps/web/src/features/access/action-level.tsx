import { Action } from "@pc/domain"
import { cn } from "@/lib/utils"
import { actionMeta } from "./action-meta"

const levels = Action.literals

/** Actions are cumulative, so they read as a gauge: admin fills all four steps, read fills one. */
export function ActionLevel({ action }: { readonly action: Action }) {
  const level = levels.indexOf(action)
  return (
    <span className="inline-flex items-center gap-2" title={actionMeta[action].description}>
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {levels.map((step, index) => (
          <span
            key={step}
            className={cn("w-1 rounded-full", index <= level ? "bg-foreground/80" : "bg-border")}
            style={{ height: `${6 + index * 2}px` }}
          />
        ))}
      </span>
      <span className="text-sm">{actionMeta[action].label}</span>
    </span>
  )
}

import type { Resource } from "@pc/domain"
import type { CSSProperties } from "react"
import { PaperPlane } from "@/components/sky/paper-plane"
import "../sky/moments.css"
import { ToolBadge } from "../tool/tool-badge"

const shown = 6

/**
 * What the member's agents can reach, brought in by the plane: cards arrive one after another and their
 * switches flip on, like the landing's onboarding cards. The list reads plainly without the motion.
 */
export function GrantedTools({ resources }: { readonly resources: ReadonlyArray<Resource> }) {
  if (resources.length === 0) {
    return <p className="rounded-xl bg-muted/55 p-4 text-sm text-muted-foreground">Nothing yet. An admin grants tools to your role or team; they show up here and in your agent.</p>
  }
  const rest = resources.length - shown
  return (
    <div className="flex flex-col gap-2">
      <PaperPlane className="onb-arrive w-12 -rotate-6" strokeWidth={4} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {resources.slice(0, shown).map((resource, index) => (
          <li key={resource.id} className="onb-arrive flex items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-2.5" style={{ "--i": index + 1 } as CSSProperties}>
            <ToolBadge resource={resource} />
            <span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-muted ring-1 ring-border">
              <span className="onb-switch-track absolute inset-0 rounded-full bg-brand" style={{ "--i": index } as CSSProperties} />
              <span className="onb-switch-knob absolute top-0.5 left-[18px] size-4 rounded-full bg-white shadow-xs" style={{ "--i": index } as CSSProperties} />
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 && <p className="text-sm text-muted-foreground">and {rest} more, listed under Resources.</p>}
    </div>
  )
}

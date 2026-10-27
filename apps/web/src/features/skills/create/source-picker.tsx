import { useRef, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"
import { skillSources, sourceMeta, type SkillSource } from "./skill-source"

const step: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** Segmented, one tab stop: arrow keys move between sources like any radio group. */
export function SourcePicker({ value, onChange }: { readonly value: SkillSource; readonly onChange: (source: SkillSource) => void }) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const move = (event: KeyboardEvent) => {
    const delta = step[event.key]
    if (delta === undefined) return
    event.preventDefault()
    const next = (skillSources.indexOf(value) + delta + skillSources.length) % skillSources.length
    const source = skillSources[next]
    if (source === undefined) return
    onChange(source)
    buttons.current[next]?.focus()
  }
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Source" onKeyDown={move} className="grid grid-cols-4 gap-0.5 rounded-md bg-muted p-0.5">
        {skillSources.map((source, index) => {
          const { label, icon: Icon } = sourceMeta[source]
          const checked = source === value
          return (
            <button
              key={source}
              ref={(element) => {
                buttons.current[index] = element
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(source)}
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-[3px] px-2 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                checked ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("size-3.5 shrink-0", checked && "text-brand")} strokeWidth={1.75} />
              {label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{sourceMeta[value].description}</p>
    </div>
  )
}

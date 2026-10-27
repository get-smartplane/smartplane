import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Choice<V extends string> {
  readonly value: V
  readonly label: string
  readonly description?: string
  readonly icon?: LucideIcon
}

interface ChoiceCardsProps<V extends string> {
  readonly id?: string
  readonly label: string
  readonly choices: ReadonlyArray<Choice<V>>
  readonly value: V
  readonly onChange: (value: V) => void
  /** Grid columns from the small breakpoint up. */
  readonly columns?: 1 | 2 | 3 | 4
}

const columnClass = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" } as const

/** Every option visible at once, so a choice is one click; used wherever a form picks one of a few. */
export function ChoiceCards<V extends string>({ id, label, choices, value, onChange, columns = 3 }: ChoiceCardsProps<V>) {
  return (
    <div id={id} role="radiogroup" aria-label={label} className={cn("grid gap-1.5", columnClass[columns])}>
      {choices.map(({ value: choice, label: text, description, icon: Icon }) => {
        const checked = choice === value
        return (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(choice)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              checked ? "border-brand bg-brand/8 ring-1 ring-brand" : "border-input hover:bg-accent/50"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              {Icon && <Icon className={cn("size-4 shrink-0", checked ? "text-brand" : "text-muted-foreground")} strokeWidth={1.75} />}
              {text}
            </span>
            {description && <span className="text-xs leading-snug text-muted-foreground">{description}</span>}
          </button>
        )
      })}
    </div>
  )
}

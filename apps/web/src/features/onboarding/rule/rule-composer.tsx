import { PenLine } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { RuleSuggestion } from "./suggestions"

/** A suggestion's index, or the free-text box. */
export type RuleChoice = number | "own"

interface RuleComposerProps {
  readonly suggestions: ReadonlyArray<RuleSuggestion>
  readonly choice: RuleChoice
  readonly onChoice: (choice: RuleChoice) => void
  readonly own: string
  readonly onOwn: (rule: string) => void
  readonly error: string | undefined
}

const cardClass = (checked: boolean) =>
  cn(
    "flex w-full flex-col gap-1 rounded-lg border bg-card px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow] duration-150 ease-out-quint outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    checked ? "border-brand ring-1 ring-brand" : "border-border hover:border-input hover:bg-accent/40"
  )

/** Three rules that fit the tool, read in full, or one in your own words. */
export function RuleComposer({ suggestions, choice, onChoice, own, onOwn, error }: RuleComposerProps) {
  return (
    <div role="radiogroup" aria-label="Rule" className="flex flex-col gap-2">
      {suggestions.map((suggestion, index) => (
        <button key={suggestion.label} type="button" role="radio" aria-checked={choice === index} onClick={() => onChoice(index)} className={cardClass(choice === index)}>
          <span className="text-xs font-semibold text-muted-foreground">{suggestion.label}</span>
          <span className="text-[0.9375rem] text-pretty">{suggestion.rule}</span>
        </button>
      ))}
      <div className={cardClass(choice === "own")}>
        <button type="button" role="radio" aria-checked={choice === "own"} onClick={() => onChoice("own")} className="flex items-center gap-2 text-left text-sm font-semibold outline-none">
          <PenLine className="size-4 text-muted-foreground" aria-hidden="true" />
          Write your own
        </button>
        {choice === "own" && (
          <Textarea
            aria-label="Your rule"
            autoFocus
            rows={2}
            className="mt-2 bg-background"
            placeholder="Nobody deletes reports from the Q3 folder."
            value={own}
            aria-invalid={error !== undefined}
            onChange={(event) => onOwn(event.target.value)}
          />
        )}
        {choice === "own" && error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}

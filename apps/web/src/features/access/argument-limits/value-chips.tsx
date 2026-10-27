import type { ArgumentValue } from "@pc/domain"
import { X } from "lucide-react"
import { useState, type KeyboardEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ValueChipsProps {
  readonly id: string
  readonly values: ReadonlyArray<string>
  readonly onChange: (values: ReadonlyArray<string>) => void
  /** The input's own choices (an enum), offered one click away. */
  readonly choices: ReadonlyArray<ArgumentValue>
  readonly invalid: boolean
}

/** Allowed values as chips: type one and press Enter (or comma); paste several separated by commas. */
export function ValueChips({ id, values, onChange, choices, invalid }: ValueChipsProps) {
  const [draft, setDraft] = useState("")
  const add = (text: string) => {
    const next = text.split(",").map((part) => part.trim()).filter((part) => part !== "" && !values.includes(part))
    if (next.length > 0) onChange([...values, ...new Set(next)])
    setDraft("")
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && draft === "" && values.length > 0) return onChange(values.slice(0, -1))
    if (event.key !== "Enter" && event.key !== ",") return
    event.preventDefault()
    add(draft)
  }
  const suggestions = choices.map(String).filter((choice) => !values.includes(choice))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-card px-1.5 py-1 focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive" aria-invalid={invalid}>
        {values.map((value) => (
          <Badge key={value} variant="secondary" className="font-mono text-foreground">
            {value}
            <button type="button" aria-label={`Remove ${value}`} onClick={() => onChange(values.filter((v) => v !== value))}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          id={id}
          className="h-6 min-w-28 flex-1 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder={values.length === 0 ? "Type a value, press Enter" : "Add another"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.slice(0, 8).map((choice) => (
            <Button key={choice} type="button" variant="outline" size="xs" className="font-mono" onClick={() => onChange([...values, choice])}>
              + {choice}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

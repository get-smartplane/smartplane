import type { IntegrationAction } from "@pc/domain"
import { useState } from "react"
import { matchesQuery, SearchInput } from "@/components/form/search-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { groupOf } from "./action-groups"

interface ActionsPickerProps {
  readonly id: string
  /** The actions to choose from (already supported, and within any resource allow-list). */
  readonly actions: ReadonlyArray<IntegrationAction>
  readonly value: ReadonlyArray<string>
  readonly onChange: (names: ReadonlyArray<string>) => void
  readonly invalid?: boolean
}

/** A searchable checklist with one-click presets; "Reads only" is the common safe start. */
export function ActionsPicker({ id, actions, value, onChange, invalid }: ActionsPickerProps) {
  const [query, setQuery] = useState("")
  const shown = actions.filter((action) => matchesQuery(query, [action.name, action.displayName]))
  const toggle = (name: string, on: boolean) => onChange(actions.map((a) => a.name).filter((n) => (n === name ? on : value.includes(n))))
  const preset = (label: string, names: ReadonlyArray<string>) => (
    <Button type="button" variant="ghost" size="xs" onClick={() => onChange(names)}>
      {label}
    </Button>
  )
  return (
    <div id={id} className={cn("flex flex-col gap-2 rounded-lg border bg-card p-2", invalid && "border-destructive/50")}>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput label="Search actions" value={query} onChange={setQuery} className="min-w-40 flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.length} of {actions.length}
        </span>
        <span className="flex gap-0.5">
          {preset("All", actions.map((a) => a.name))}
          {preset("Reads only", actions.filter((a) => groupOf(a) === "reads").map((a) => a.name))}
          {preset("None", [])}
        </span>
      </div>
      <ul className="flex max-h-56 flex-col overflow-y-auto">
        {shown.map((action) => {
          const checkboxId = `${id}-${action.name}`
          return (
            <li key={action.name}>
              <Label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 font-normal hover:bg-muted/60">
                <Checkbox id={checkboxId} checked={value.includes(action.name)} onCheckedChange={(on) => toggle(action.name, on === true)} />
                <span className="truncate">{action.displayName}</span>
                <code className="hidden truncate text-xs text-muted-foreground sm:inline">{action.name}</code>
                {groupOf(action) === "changes" && <span className="ml-auto shrink-0 text-[0.6875rem] text-muted-foreground">write</span>}
              </Label>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">No action matches.</li>}
      </ul>
    </div>
  )
}

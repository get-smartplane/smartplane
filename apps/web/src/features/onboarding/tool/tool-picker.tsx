import type { McpCatalogItem } from "@pc/domain"
import { Check, ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { catalogAtom } from "@/features/integrations/atoms"
import { PieceLogo } from "@/features/integrations/piece-logo"
import { categoryLabel } from "@/features/mcp-catalog/categories"
import { cn } from "@/lib/utils"
import { otherOptions, serverChoice, type ToolChoice, topServerCount } from "./tool-options"

interface ToolPickerProps {
  readonly servers: ReadonlyArray<McpCatalogItem>
  readonly value: ToolChoice | null
  readonly onChange: (choice: ToolChoice) => void
}

interface CardProps {
  readonly name: string
  readonly blurb: string
  readonly logo: ReactNode
  readonly checked: boolean
  readonly onPick: () => void
}

function Card({ name, blurb, logo, checked, onPick }: CardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onPick}
      className={cn(
        "relative flex items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-[border-color,background-color,box-shadow] duration-150 ease-out-quint outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        checked ? "border-brand ring-1 ring-brand" : "border-border hover:border-input hover:bg-accent/40"
      )}
    >
      {logo}
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{blurb}</span>
      </span>
      {checked && <Check className="ml-auto size-4 shrink-0 text-brand" aria-hidden="true" />}
    </button>
  )
}

/** The most popular official servers (the same catalog as Integrations), "More…" for the rest, then other kinds of tools. */
export function ToolPicker({ servers, value, onChange }: ToolPickerProps) {
  const [more, setMore] = useState(false)
  const logos = new Map<string, string>(useQueryData(catalogAtom, []).map((piece) => [piece.id, piece.logoUrl]))
  const shown = more ? servers : servers.slice(0, topServerCount)
  const pickedHidden = !more && servers.slice(topServerCount).some(({ entry }) => value === serverChoice(entry.slug))
  return (
    <div role="radiogroup" aria-label="Tool" className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-3">
        {(pickedHidden ? servers : shown).map(({ entry }) => (
          <Card
            key={entry.slug}
            name={entry.name}
            blurb={categoryLabel[entry.category]}
            logo={<PieceLogo url={entry.logoUrl} name={entry.name} />}
            checked={value === serverChoice(entry.slug)}
            onPick={() => onChange(serverChoice(entry.slug))}
          />
        ))}
      </div>
      {servers.length > topServerCount && !more && !pickedHidden && (
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setMore(true)}>
          <ChevronDown />
          More… ({servers.length - topServerCount})
        </Button>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {otherOptions.map((option) => {
          const Icon = option.icon
          const logo = Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <Icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
            </span>
          ) : (
            <PieceLogo url={logos.get(option.id)} name={option.name} />
          )
          return <Card key={option.id} name={option.name} blurb={option.blurb} logo={logo} checked={value === option.id} onPick={() => onChange(option.id)} />
        })}
      </div>
    </div>
  )
}

import type { UpstreamToolSummary } from "@pc/domain"
import { TriangleAlert } from "lucide-react"
import { useState } from "react"
import { matchesQuery, SearchInput } from "@/components/form/search-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ToolAccessBadge } from "@/features/mcp-catalog/tool-access-badge"

interface McpToolsPickerProps {
  readonly tools: ReadonlyArray<UpstreamToolSummary>
  readonly value: ReadonlyArray<string>
  readonly onChange: (names: ReadonlyArray<string>) => void
}

/**
 * An MCP server's live tools as a checklist, each with what it says it does, so an allow-list is chosen with
 * understanding. Destructive tools are marked and never part of "Reads only".
 */
export function McpToolsPicker({ tools, value, onChange }: McpToolsPickerProps) {
  const [query, setQuery] = useState("")
  const shown = tools.filter((tool) => matchesQuery(query, [tool.name, tool.title ?? null, tool.description ?? null]))
  const toggle = (name: string, on: boolean) => onChange(on ? [...value, name] : value.filter((n) => n !== name))
  const chosenDestructive = tools.filter((tool) => tool.access === "destructive" && value.includes(tool.name)).length
  const preset = (label: string, names: ReadonlyArray<string>) => (
    <Button type="button" variant="ghost" size="xs" onClick={() => onChange(names)}>
      {label}
    </Button>
  )
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput label="Search tools" value={query} onChange={setQuery} className="min-w-40 flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {value.length} of {tools.length}
        </span>
        <span className="flex gap-0.5">
          {preset("All", tools.map((tool) => tool.name))}
          {preset("Reads only", tools.filter((tool) => tool.access === "read").map((tool) => tool.name))}
          {preset("None", [])}
        </span>
      </div>
      <ul className="flex max-h-60 flex-col overflow-y-auto">
        {shown.map((tool) => {
          const id = `grant-tool-${tool.name}`
          return (
            <li key={tool.name}>
              <Label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 font-normal hover:bg-muted/60">
                <Checkbox id={id} className="mt-0.5" checked={value.includes(tool.name)} onCheckedChange={(on) => toggle(tool.name, on === true)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <code className="truncate font-mono text-[0.8125rem]">{tool.name}</code>
                  {tool.description && <span className="line-clamp-1 text-xs text-muted-foreground">{tool.description}</span>}
                </span>
                <ToolAccessBadge access={tool.access} />
              </Label>
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">No tool matches.</li>}
      </ul>
      {chosenDestructive > 0 && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-danger-ink">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {chosenDestructive === 1 ? "1 chosen tool may delete or overwrite data" : `${chosenDestructive} chosen tools may delete or overwrite data`}. Consider a guard rule.
        </p>
      )}
    </div>
  )
}

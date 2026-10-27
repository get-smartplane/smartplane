import { X } from "lucide-react"
import { RowAction } from "@/components/form/row-action"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { coerce, formatValues, isIncomplete, isMalformedPath, type ArgumentLimitDraft } from "./argument-limits"
import type { ArgumentInfo } from "./input-schema"
import { ValueChips } from "./value-chips"

export interface ToolOption {
  readonly name: string
  readonly label: string
}

interface ArgumentLimitRowProps {
  readonly limit: ArgumentLimitDraft
  /** Known tools become a picker; without them (MCP servers) the name is typed, with these as suggestions. */
  readonly tools: ReadonlyArray<ToolOption>
  readonly toolsKnown: boolean
  readonly argumentsOf: (tool: string) => ReadonlyArray<ArgumentInfo>
  readonly onChange: (limit: ArgumentLimitDraft) => void
  readonly onRemove: () => void
  readonly showErrors: boolean
}

/** One limit, read back as a sentence underneath so its effect is never a guess. */
export function ArgumentLimitRow({ limit, tools, toolsKnown, argumentsOf, onChange, onRemove, showErrors }: ArgumentLimitRowProps) {
  const id = `limit-${limit.key}`
  const args = argumentsOf(limit.tool)
  const argument = args.find((candidate) => candidate.path === limit.path.trim())
  const malformed = isMalformedPath(limit.path)
  const invalid = showErrors && (isIncomplete(limit) || malformed)
  const typed = limit.values.map((value) => coerce(value, argument?.valueType ?? "unknown"))
  return (
    <li className={cn("flex flex-col gap-2.5 rounded-lg border bg-card p-3", invalid && "border-destructive/50")}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-tool`} className="text-xs text-muted-foreground">Tool</Label>
          {toolsKnown ? (
            <Select value={limit.tool} onValueChange={(tool) => onChange({ ...limit, tool, path: "", values: [] })}>
              <SelectTrigger id={`${id}-tool`} className="w-full" aria-invalid={invalid && limit.tool === ""}>
                <SelectValue placeholder="Choose a tool" />
              </SelectTrigger>
              <SelectContent>
                {tools.map((tool) => <SelectItem key={tool.name} value={tool.name}>{tool.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input id={`${id}-tool`} className="font-mono" list={`${id}-tools`} placeholder="run_action" value={limit.tool} aria-invalid={invalid && limit.tool === ""} onChange={(event) => onChange({ ...limit, tool: event.target.value.trim() })} />
          )}
          <datalist id={`${id}-tools`}>{tools.map((tool) => <option key={tool.name} value={tool.name} />)}</datalist>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-path`} className="text-xs text-muted-foreground">Argument</Label>
          <Input id={`${id}-path`} className="font-mono" list={`${id}-paths`} placeholder={args[0]?.path ?? "input.owner"} value={limit.path} aria-invalid={invalid && (limit.path.trim() === "" || malformed)} onChange={(event) => onChange({ ...limit, path: event.target.value })} />
          <datalist id={`${id}-paths`}>{args.map((arg) => <option key={arg.path} value={arg.path}>{arg.title ?? arg.path}</option>)}</datalist>
        </div>
        <RowAction label="Remove limit" danger onClick={onRemove} className="justify-self-end">
          <X />
        </RowAction>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-values`} className="text-xs text-muted-foreground">Allowed values</Label>
        <ValueChips id={`${id}-values`} values={limit.values} onChange={(values) => onChange({ ...limit, values })} choices={argument?.choices ?? []} invalid={invalid && limit.values.length === 0} />
      </div>
      <p className={cn("text-xs text-pretty", invalid ? "text-danger-ink" : "text-muted-foreground")}>
        {malformed
          ? <>Argument paths use letters, digits, <code>_</code> and <code>-</code>, joined by dots, like <code>input.owner</code>.</>
          : isIncomplete(limit) || limit.tool === ""
          ? "Choose a tool, an argument and at least one value."
          : <>Only allow <code className="text-foreground">{limit.tool}</code> when <code className="text-foreground">{limit.path.trim()}</code> is {typed.length === 1 ? "" : "one of "}<span className="text-foreground">{formatValues(typed)}</span>.</>}
      </p>
    </li>
  )
}

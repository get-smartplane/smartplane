import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import type { ToolSource } from "../tool-source"
import { ArgumentLimitRow, type ToolOption } from "./argument-limit-row"
import { emptyLimit, type ArgumentLimitDraft } from "./argument-limits"
import { argumentsOf } from "./input-schema"

interface ArgumentLimitsFieldProps {
  readonly source: ToolSource
  readonly limits: ReadonlyArray<ArgumentLimitDraft>
  readonly onChange: (limits: ReadonlyArray<ArgumentLimitDraft>) => void
  /** Allowed tools, when the grant has an allow-list: limits are offered for those. */
  readonly allowedTools: ReadonlyArray<string> | null
  readonly error: string | undefined
}

const toolOptions = (source: ToolSource, allowed: ReadonlyArray<string> | null): ReadonlyArray<ToolOption> => {
  if (source.kind === "tool") return [{ name: source.toolName, label: source.toolName }]
  if (source.kind === "mcp_server") return (allowed ?? []).map((name) => ({ name, label: name }))
  return source.actions.filter((action) => allowed === null || allowed.includes(action.name)).map((action) => ({ name: action.name, label: action.displayName }))
}

/** `conditions.arguments` as rows: narrow a tool to the targets it may touch (a repo, a channel, a piece). */
export function ArgumentLimitsField({ source, limits, onChange, allowedTools, error }: ArgumentLimitsFieldProps) {
  const tools = toolOptions(source, allowedTools)
  const typesKnown = source.kind === "integration"
  const schemaOf = (tool: string) => (source.kind === "integration" ? source.actions.find((action) => action.name === tool)?.inputSchema : undefined)
  const add = () => onChange([...limits, emptyLimit(Math.max(0, ...limits.map((limit) => limit.key)) + 1, source.kind === "tool" ? source.toolName : "")])
  return (
    <Field data-invalid={error !== undefined}>
      <FieldLabel htmlFor="grant-limits-add">Argument limits</FieldLabel>
      <FieldDescription>
        Only allow a tool when an argument holds one of the values you list, such as one repository or one channel. Values match exactly; calls without the argument are refused.
        {!typesKnown && <> Numbers and <code>true</code>/<code>false</code> match numbers and booleans; put a value in double quotes to match it as text.</>}
      </FieldDescription>
      {limits.length > 0 && (
        <ul className="flex flex-col gap-2">
          {limits.map((limit) => (
            <ArgumentLimitRow
              key={limit.key}
              limit={limit}
              tools={tools}
              toolsKnown={source.kind !== "mcp_server"}
              argumentsOf={(tool) => argumentsOf(schemaOf(tool))}
              onChange={(next) => onChange(limits.map((candidate) => (candidate.key === limit.key ? next : candidate)))}
              onRemove={() => onChange(limits.filter((candidate) => candidate.key !== limit.key))}
              showErrors={error !== undefined}
            />
          ))}
        </ul>
      )}
      <Button id="grant-limits-add" type="button" variant="outline" size="sm" className="w-fit" onClick={add}>
        <Plus />
        Add a limit
      </Button>
      <FieldError>{error}</FieldError>
    </Field>
  )
}

import { FormField } from "@/components/form/form-field"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ActionsPicker } from "@/features/integrations/actions/actions-picker"
import type { FieldErrors } from "@/lib/forms/decode-form"
import { ArgumentLimitsField } from "./argument-limits/argument-limits-field"
import type { GrantDraft } from "./grant-draft"
import { ToolAllowlistField } from "./tool-allowlist-field"
import type { ToolSource } from "./tool-source"
import { withoutTools } from "./write-level"
import { WriteLevelHint } from "./write-level-hint"

interface GrantAdvancedFieldsProps {
  readonly draft: GrantDraft
  readonly set: <K extends keyof GrantDraft>(key: K, value: GrantDraft[K]) => void
  /** The chosen resource's tools, when it has any (MCP server, single tool, integration). */
  readonly source: ToolSource | undefined
  readonly errors: FieldErrors
}

/** Expiry, the tool allow-list and argument limits: all have safe defaults (never, all tools, any arguments). */
export function GrantAdvancedFields({ draft, set, source, errors }: GrantAdvancedFieldsProps) {
  const listable = source !== undefined && source.kind !== "tool"
  const noun = source?.kind === "integration" ? "actions" : "tools"
  return (
    <>
      <FormField id="grant-expiry" label="Expires" error={errors.expiresAt} description="Leave empty for no expiry. Access ends at the end of that day (UTC).">
        <Input id="grant-expiry" type="date" className="w-fit" value={draft.expiry} onChange={(e) => set("expiry", e.target.value)} />
      </FormField>
      {source === undefined && <p className="text-xs text-muted-foreground">Pick an integration or an MCP server above to limit the grant to some of its tools, or to certain arguments.</p>}
      {listable && (
        <Field orientation="horizontal">
          <Switch id="grant-restrict" checked={draft.restrictTools} onCheckedChange={(on) => set("restrictTools", on)} />
          <FieldContent>
            <FieldLabel htmlFor="grant-restrict">Only allow specific {noun}</FieldLabel>
            <FieldDescription>Without an allow-list, every {noun === "actions" ? "offered action" : "tool"} of {source.resource.name} is allowed at this level.</FieldDescription>
          </FieldContent>
        </Field>
      )}
      {listable && draft.restrictTools && (
        <FormField id="grant-tools" label={`Allowed ${noun}`} error={errors["conditions.tools"]}>
          {source.kind === "integration" ? (
            <ActionsPicker id="grant-tools" actions={source.actions} value={draft.tools} onChange={(tools) => set("tools", tools)} invalid={errors["conditions.tools"] !== undefined} />
          ) : (
            <ToolAllowlistField serverId={source.resource.id} tools={draft.tools} onChange={(tools) => set("tools", tools)} />
          )}
        </FormField>
      )}
      {source?.kind === "integration" && (
        <WriteLevelHint
          action={draft.action}
          actions={source.actions}
          chosen={draft.restrictTools ? draft.tools : null}
          onSwitchToWrite={() => set("action", "write")}
          onRemove={(names) => {
            const { tools, argumentLimits } = withoutTools(draft, names)
            set("tools", tools)
            set("argumentLimits", argumentLimits)
          }}
        />
      )}
      {source && (
        <ArgumentLimitsField
          source={source}
          limits={draft.argumentLimits}
          onChange={(limits) => set("argumentLimits", limits)}
          allowedTools={draft.restrictTools ? draft.tools : null}
          error={errors["conditions.arguments"]}
        />
      )}
    </>
  )
}

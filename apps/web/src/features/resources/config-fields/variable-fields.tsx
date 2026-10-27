import { FormField } from "@/components/form/form-field"
import { Textarea } from "@/components/ui/textarea"
import type { ConfigFieldsProps } from "../config-draft"

export function VariableFields({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <FormField id="variable-value" label="Value" error={errors["config.value"]} description="Stored in plain text. Use a secret for credentials.">
      <Textarea
        id="variable-value"
        rows={3}
        className="font-mono text-xs"
        value={draft.value}
        onChange={(event) => set("value", event.target.value)}
      />
    </FormField>
  )
}

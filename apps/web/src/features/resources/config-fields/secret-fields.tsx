import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import type { ConfigFieldsProps } from "../config-draft"

/** Write-only: the value is encrypted server-side and can never be read back. */
export function SecretFields({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <FormField
      id="secret-value"
      label="Secret value"
      error={errors["config.value"] && "Enter a value (up to 64 KB)."}
      description="Encrypted on save. It is never shown again, to you or to agents."
    >
      <Input
        id="secret-value"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft.value}
        aria-invalid={errors["config.value"] !== undefined}
        onChange={(event) => set("value", event.target.value)}
      />
    </FormField>
  )
}

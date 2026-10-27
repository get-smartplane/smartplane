import { RotateSecret, type Resource } from "@pc/domain"
import { Redacted } from "effect"
import { RotateCw } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { RowAction } from "@/components/form/row-action"
import { Input } from "@/components/ui/input"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { rotateSecretAtom } from "./atoms"

const messages = { value: "Enter the new value (up to 64 KB)." }

export function RotateSecretDialog({ resource }: { readonly resource: Resource }) {
  const [value, setValue] = useState("")
  const rotate = useMutation(rotateSecretAtom, { success: "Secret rotated" })
  const form = useForm(RotateSecret, { ...rotate, execute: (payload) => rotate.execute({ id: resource.id, payload }) }, messages)

  return (
    <FormDialog
      trigger={
        <RowAction label={`Rotate ${resource.name}`}>
          <RotateCw />
        </RowAction>
      }
      title={`Rotate ${resource.name}`}
      description="Servers and databases that reference this secret use the new value on their next call. The old version stays encrypted for audit."
      submitLabel="Rotate secret"
      form={form}
      input={() => ({ value: Redacted.make(value) })}
      onOpenChange={(open) => open || setValue("")}
    >
      <FormField id={`rotate-${resource.id}`} label="New value" error={form.errors.value}>
        <Input
          id={`rotate-${resource.id}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={form.errors.value !== undefined}
          onChange={(event) => setValue(event.target.value)}
        />
      </FormField>
    </FormDialog>
  )
}

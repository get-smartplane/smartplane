import type { ReactNode } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"

interface FormFieldProps {
  readonly id: string
  readonly label: string
  readonly error?: string | undefined
  readonly description?: ReactNode
  readonly children: ReactNode
}

/** Label, control, help text and the decoded schema error for one field. */
export function FormField({ id, label, error, description, children }: FormFieldProps) {
  return (
    <Field data-invalid={error !== undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {description && !error && <FieldDescription>{description}</FieldDescription>}
      <FieldError>{error}</FieldError>
    </Field>
  )
}

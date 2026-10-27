import { OrgPermission } from "@pc/domain"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { permissionLabels } from "./permission-labels"

interface PermissionChecklistProps {
  readonly value: ReadonlyArray<OrgPermission>
  readonly onChange: (value: ReadonlyArray<OrgPermission>) => void
}

export function PermissionChecklist({ value, onChange }: PermissionChecklistProps) {
  const toggle = (permission: OrgPermission, checked: boolean) =>
    onChange(checked ? [...value, permission] : value.filter((existing) => existing !== permission))

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {OrgPermission.literals.map((permission) => {
        const id = `permission-${permission}`
        return (
          <Field key={permission} orientation="horizontal" className="rounded-lg border p-3">
            <Checkbox
              id={id}
              checked={value.includes(permission)}
              onCheckedChange={(checked) => toggle(permission, checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor={id}>{permissionLabels[permission].label}</FieldLabel>
              <FieldDescription>{permissionLabels[permission].description}</FieldDescription>
            </FieldContent>
          </Field>
        )
      })}
    </div>
  )
}

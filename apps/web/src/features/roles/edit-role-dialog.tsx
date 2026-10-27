import { UpdateRole, type OrgPermission, type Role } from "@pc/domain"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { RowAction } from "@/components/form/row-action"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { updateRoleAtom } from "./atoms"
import { PermissionChecklist } from "./permission-checklist"

export function EditRoleDialog({ role }: { readonly role: Role }) {
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description)
  const [permissions, setPermissions] = useState<ReadonlyArray<OrgPermission>>(role.permissions)
  const update = useMutation(updateRoleAtom, { success: "Role updated" })
  const form = useForm(UpdateRole, { ...update, execute: (payload) => update.execute({ slug: role.slug, payload }) })

  return (
    <FormDialog
      trigger={
        <RowAction label={`Edit ${role.name}`}>
          <Pencil />
        </RowAction>
      }
      title={`Edit ${role.name}`}
      description="Members holding this role get the new permissions on their next request."
      submitLabel="Save changes"
      wide
      form={form}
      input={() => ({ name, description, permissions })}
    >
      <FormField id={`role-${role.slug}-name`} label="Name" error={form.errors.name}>
        <Input id={`role-${role.slug}-name`} value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField id={`role-${role.slug}-description`} label="Description" error={form.errors.description}>
        <Textarea
          id={`role-${role.slug}-description`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <PermissionChecklist value={permissions} onChange={setPermissions} />
    </FormDialog>
  )
}

import { CreateRole, type OrgPermission } from "@pc/domain"
import { Plus } from "lucide-react"
import { useState } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { createRoleAtom } from "./atoms"
import { PermissionChecklist } from "./permission-checklist"

const messages = {
  slug: "Lowercase letters, digits and dashes; must not be a builtin role name.",
  name: "Enter a name between 1 and 80 characters."
}

/** "Security reviewer" → "security-reviewer"; the schema still decides whether it is valid. */
const slugOf = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)

export function CreateRoleDialog() {
  const [name, setName] = useState("")
  const [customSlug, setCustomSlug] = useState<string>()
  const [description, setDescription] = useState("")
  const [permissions, setPermissions] = useState<ReadonlyArray<OrgPermission>>([])
  const form = useForm(CreateRole, useMutation(createRoleAtom, { success: "Role created" }), messages)
  const slug = customSlug ?? slugOf(name)

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus />
          New role
        </Button>
      }
      title="New role"
      description="Name it and pick what it may do in this dashboard."
      submitLabel="Create role"
      wide
      form={form}
      input={() => ({ slug, name, description, permissions })}
      onOpenChange={(open) => {
        if (open) return
        setName("")
        setCustomSlug(undefined)
        setDescription("")
        setPermissions([])
      }}
    >
      <FormField id="role-name" label="Name" error={form.errors.name}>
        <Input id="role-name" autoFocus placeholder="Security reviewer" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <PermissionChecklist value={permissions} onChange={setPermissions} />
      <AdvancedOptions summary={slug === "" ? undefined : `Slug ${slug}`} forceOpen={form.errors.slug !== undefined}>
        <FormField id="role-slug" label="Slug" error={form.errors.slug} description="Used in the API and the audit log. It cannot change later.">
          <Input id="role-slug" className="font-mono" placeholder="security-reviewer" value={slug} onChange={(e) => setCustomSlug(e.target.value)} />
        </FormField>
        <FormField id="role-description" label="Description" error={form.errors.description}>
          <Textarea id="role-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
      </AdvancedOptions>
    </FormDialog>
  )
}

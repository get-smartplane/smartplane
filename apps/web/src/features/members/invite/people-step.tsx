import type { RoleSlug } from "@pc/domain"
import { FormField } from "@/components/form/form-field"
import { RoleSelect } from "@/features/roles/role-select"
import { EmailsField } from "./emails-field"

interface PeopleStepProps {
  readonly emails: ReadonlyArray<string>
  readonly onEmailsChange: (emails: ReadonlyArray<string>) => void
  readonly role: RoleSlug | undefined
  readonly onRoleChange: (role: RoleSlug) => void
  readonly errors: { readonly emails?: string | undefined; readonly role?: string | undefined }
}

/** Who to invite and as what. Several people can share one setup. */
export function PeopleStep({ emails, onEmailsChange, role, onRoleChange, errors }: PeopleStepProps) {
  return (
    <>
      <FormField
        id="invite-emails"
        label={emails.length > 1 ? `Emails (${emails.length})` : "Emails"}
        error={errors.emails}
        description="Paste a list or press Enter after each. Everyone here gets the same role and access."
      >
        <EmailsField id="invite-emails" emails={emails} onChange={onEmailsChange} invalid={errors.emails !== undefined} />
      </FormField>
      <FormField id="invite-role" label="Role" error={errors.role} description="What they can do in this dashboard. Access to tools and data comes from grants.">
        <RoleSelect id="invite-role" value={role} onChange={onRoleChange} invalid={errors.role !== undefined} />
      </FormField>
    </>
  )
}

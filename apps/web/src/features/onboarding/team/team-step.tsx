import { InviteWithAccess, noInviteAccess, type RoleSlug } from "@pc/domain"
import { Send } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { inviteWithAccessAtom } from "@/features/members/atoms"
import { PeopleStep } from "@/features/members/invite/people-step"
import { rolesAtom } from "@/features/roles/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { StepFrame } from "../setup/step-frame"
import type { SetupController } from "../setup/use-setup"

const messages = { emails: "Enter at least one valid email address, each once.", role: "Choose a role." }

/**
 * The members page's own invite fields (several emails, one role). Access comes from the grant made two
 * steps ago; per-person teams and grants stay on the Members page's "invite and set up access".
 */
export function TeamStep({ controller }: { readonly controller: SetupController }) {
  const [emails, setEmails] = useState<ReadonlyArray<string>>([])
  const [role, setRole] = useState<RoleSlug>()
  const memberRole = useQueryData(rolesAtom, []).find((candidate) => candidate.slug === "member")?.slug
  const chosenRole = role ?? memberRole
  const success = emails.length > 1 ? `${emails.length} invitations sent` : "Invitation sent"
  const form = useForm(InviteWithAccess, useMutation(inviteWithAccessAtom, { success }), messages)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await form.submit({ emails, role: chosenRole, access: noInviteAccess })) await controller.finish("done")
  }

  return (
    <StepFrame
      index={3}
      title="Invite your team"
      description="Each person gets an email and joins with the role you pick. Their agents then see only what their role, team and project allow."
      onBack={() => controller.go("rule")}
      onSkip={() => void controller.finish("skipped")}
      skipping={controller.saving}
      primary={
        <Button type="submit" form="setup-team" disabled={form.pending}>
          {form.pending ? <Spinner /> : <Send />}
          {emails.length > 1 ? `Send ${emails.length} invitations` : "Send invitation"}
        </Button>
      }
    >
      <form id="setup-team" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <PeopleStep emails={emails} onEmailsChange={setEmails} role={chosenRole} onRoleChange={setRole} errors={{ emails: form.errors["emails"], role: form.errors["role"] }} />
      </form>
    </StepFrame>
  )
}

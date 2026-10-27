import { InviteWithAccess, noInviteAccess, type RoleSlug } from "@pc/domain"
import { ArrowRight, UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { DialogClose } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { rolesAtom } from "@/features/roles/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { inviteWithAccessAtom } from "./atoms"
import { isEmail } from "./invite/emails-field"
import { PeopleStep } from "./invite/people-step"
import { SetupBody, type SetupStepId, setupSteps } from "./invite/setup-body"
import { SetupDialog } from "./invite/setup-dialog"
import { SetupSteps } from "./invite/setup-steps"
import { useInviteSetup } from "./invite/use-invite-setup"

type Step = "people" | SetupStepId

const steps = [{ id: "people", label: "People" }, ...setupSteps] as const
const order: ReadonlyArray<Step> = steps.map((step) => step.id)

const messages = { emails: "Enter at least one valid email address.", role: "Choose a role." }

/** Two paths from one dialog: invite now with a role, or walk through teams, projects and access first. */
export function InviteMemberDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("people")
  const [emails, setEmails] = useState<ReadonlyArray<string>>([])
  const [role, setRole] = useState<RoleSlug>()
  const [peopleErrors, setPeopleErrors] = useState<{ emails?: string; role?: string }>({})
  const state = useInviteSetup()
  // Most people join as members; the role can be changed here or later from the list.
  const roles = useQueryData(rolesAtom, [])
  const chosenRole = role ?? roles.find((candidate) => candidate.slug === "member")?.slug
  const roleName = roles.find((candidate) => candidate.slug === chosenRole)?.name ?? "a member"
  const success = emails.length > 1 ? `${emails.length} invitations sent` : "Invitation sent"
  const form = useForm(InviteWithAccess, useMutation(inviteWithAccessAtom, { success }), messages)
  const at = order.indexOf(step)

  const close = (next: boolean) => {
    setOpen(next)
    if (next) return
    form.reset()
    setStep("people")
    setEmails([])
    setRole(undefined)
    setPeopleErrors({})
    state.reset()
  }

  /** The people step must hold before anything else; a typo'd address is named, not silently dropped. */
  const peopleValid = () => {
    const errors = {
      ...(emails.length === 0 ? { emails: "Add at least one email address." } : {}),
      ...(emails.some((email) => !isEmail(email)) ? { emails: `Fix or remove ${emails.filter((email) => !isEmail(email)).join(", ")}.` } : {}),
      ...(chosenRole === undefined ? { role: "Choose a role." } : {})
    }
    setPeopleErrors(errors)
    return Object.keys(errors).length === 0
  }

  const send = async (withAccess: boolean) => {
    if (!peopleValid()) return setStep("people")
    const sent = await form.submit({ emails, role: chosenRole, access: withAccess ? state.toAccess() : noInviteAccess })
    if (sent !== undefined) close(false)
  }

  // A refused field sends you back to the step that holds it.
  useEffect(() => {
    const failed = Object.keys(form.errors)
    if (failed.some((path) => path.startsWith("access"))) setStep("access")
    else if (failed.some((path) => path === "emails" || path.startsWith("emails.") || path === "role")) setStep("people")
  }, [form.errors])

  const next = () => {
    if (step === "people" && !peopleValid()) return
    setStep(order[at + 1] ?? "review")
  }
  const primary = step === "people" ? next : step === "review" ? () => void send(true) : next

  return (
    <SetupDialog
      trigger={
        <Button>
          <UserPlus />
          Invite members
        </Button>
      }
      open={open}
      onOpenChange={close}
      title="Invite members"
      description={step === "people" ? "They get an email and join with this role. Set up their access now, or later." : `${emails.length === 1 ? emails[0] : `${emails.length} people`}, joining as ${roleName}.`}
      steps={step !== "people" && <SetupSteps steps={steps} current={step} onSelect={setStep} />}
      onSubmit={primary}
      footer={
        <>
          <div className="flex gap-2">
            {step === "people" ? (
              <DialogClose asChild>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
            ) : (
              <Button variant="outline" type="button" onClick={() => setStep(order[at - 1] ?? "people")}>Back</Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step === "people" && (
              <Button variant="outline" type="button" disabled={form.pending} onClick={() => void send(false)}>
                {form.pending && <Spinner />}
                Just invite
              </Button>
            )}
            <Button type="submit" disabled={form.pending}>
              {step === "review" && form.pending && <Spinner />}
              {step === "people" ? "Invite and set up access" : step === "review" ? (emails.length > 1 ? `Send ${emails.length} invitations` : "Send invitation") : "Continue"}
              {step !== "review" && <ArrowRight />}
            </Button>
          </div>
        </>
      }
    >
      {step === "people" ? (
        <PeopleStep
          emails={emails}
          onEmailsChange={(next) => (setEmails(next), setPeopleErrors({}))}
          role={chosenRole}
          onRoleChange={setRole}
          errors={{ emails: peopleErrors.emails ?? form.errors.emails, role: peopleErrors.role ?? form.errors.role }}
        />
      ) : (
        <SetupBody step={step} state={state} role={chosenRole} emails={emails} errors={form.errors} />
      )}
    </SetupDialog>
  )
}

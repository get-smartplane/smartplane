import { InviteAccess, type Member, type PendingInvite } from "@pc/domain"
import { ArrowRight, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { RowAction } from "@/components/form/row-action"
import { Button } from "@/components/ui/button"
import { DialogClose } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { setInviteAccessAtom } from "../atoms"
import { emptySetup, fromInviteAccess } from "./invite-setup"
import { SetupBody, type SetupStepId, setupSteps } from "./setup-body"
import { SetupDialog } from "./setup-dialog"
import { SetupSteps } from "./setup-steps"
import { useInviteSetup } from "./use-invite-setup"

const order: ReadonlyArray<SetupStepId> = setupSteps.map((step) => step.id)

interface EditInviteAccessDialogProps {
  readonly member: Member
  readonly invite: PendingInvite | undefined
}

/** Changes what a pending invitation carries; it still applies only when they accept. */
export function EditInviteAccessDialog({ member, invite }: EditInviteAccessDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<SetupStepId>("teams")
  const state = useInviteSetup(invite ? fromInviteAccess(invite.access) : emptySetup)
  const save = useMutation(setInviteAccessAtom, { success: "Access setup saved" })
  const form = useForm(InviteAccess, { ...save, execute: (access) => save.execute({ id: member.id, access }) })
  const at = order.indexOf(step)

  const change = (next: boolean) => {
    setOpen(next)
    form.reset()
    setStep("teams")
    state.reset()
  }

  useEffect(() => {
    if (Object.keys(form.errors).some((path) => path.startsWith("grants"))) setStep("access")
  }, [form.errors])

  const submit = async () => {
    if (step !== "review") return setStep(order[at + 1] ?? "review")
    if ((await form.submit(state.toAccess())) !== undefined) change(false)
  }

  return (
    <SetupDialog
      trigger={
        <RowAction label={invite ? `Change access for ${member.email}` : `Set up access for ${member.email}`}>
          <SlidersHorizontal />
        </RowAction>
      }
      open={open}
      onOpenChange={change}
      title={`Access for ${member.email}`}
      description="Applies when they accept the invitation. Until then they have no access."
      steps={<SetupSteps steps={setupSteps} current={step} onSelect={setStep} />}
      onSubmit={() => void submit()}
      footer={
        <>
          <div className="flex gap-2">
            {at === 0 ? (
              <DialogClose asChild>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
            ) : (
              <Button variant="outline" type="button" onClick={() => setStep(order[at - 1] ?? "teams")}>Back</Button>
            )}
          </div>
          <Button type="submit" disabled={form.pending}>
            {form.pending && <Spinner />}
            {step === "review" ? "Save setup" : "Continue"}
            {step !== "review" && <ArrowRight />}
          </Button>
        </>
      }
    >
      <SetupBody step={step} state={state} role={member.role} errors={form.errors} />
    </SetupDialog>
  )
}

import type { FormEvent, ReactNode } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"

interface SetupDialogProps {
  readonly trigger: ReactNode
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description: ReactNode
  /** The step indicator, once there is more than one step to show. */
  readonly steps?: ReactNode
  /** Enter runs the step's primary action. */
  readonly onSubmit: () => void
  readonly footer: ReactNode
  readonly children: ReactNode
}

/** A dialog that walks through steps in place: steps on top, the current step scrolling, actions fixed below. */
export function SetupDialog({ trigger, open, onOpenChange, title, description, steps, onSubmit, footer, children }: SetupDialogProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* A stray click outside must not throw away a half-built setup; Esc and Cancel still close it. */}
      <DialogContent className="sm:max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {steps}
          <FieldGroup className="max-h-[58svh] min-h-48 overflow-y-auto px-0.5 pb-0.5">{children}</FieldGroup>
          <DialogFooter className="gap-2 sm:justify-between">{footer}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

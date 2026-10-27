import { useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type { FormController } from "@/lib/forms/use-form"

interface FormDialogProps<A> {
  readonly trigger: ReactNode
  readonly title: string
  readonly description?: ReactNode
  readonly submitLabel: string
  readonly form: FormController<A>
  /** Collects the current field values; decoded by the form's schema on submit. */
  readonly input: () => unknown
  readonly onOpenChange?: (open: boolean) => void
  readonly onSuccess?: (value: A) => void
  readonly wide?: boolean
  readonly children: ReactNode
}

export function FormDialog<A>(props: FormDialogProps<A>) {
  const { trigger, title, description, submitLabel, form, input, onOpenChange, onSuccess, wide, children } = props
  const [open, setOpen] = useState(false)

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (!next) form.reset()
    onOpenChange?.(next)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    // React bubbles events through portals: a dialog opened from inside another form must not submit that one too.
    event.stopPropagation()
    const value = await form.submit(input())
    if (value === undefined) return
    onSuccess?.(value)
    changeOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* A stray click outside must not throw away a half-filled form; Esc and Cancel still close it. */}
      <DialogContent className={wide ? "sm:max-w-2xl" : "sm:max-w-md"} onInteractOutside={(event) => event.preventDefault()}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FieldGroup className="max-h-[60svh] overflow-y-auto px-0.5">{children}</FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={form.pending}>
              {form.pending && <Spinner />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

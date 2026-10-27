import { type Guard, nameFromRule, UpdateGuard } from "@pc/domain"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { RowAction } from "@/components/form/row-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { updateGuardAtom } from "./atoms"

const messages = { name: "Enter a name between 1 and 80 characters." }

/** Naming a rule by hand stops it following the rule text; going back to the derived name resumes that. */
export function RenameGuardDialog({ guard }: { readonly guard: Guard }) {
  const [name, setName] = useState(guard.name)
  const update = useMutation(updateGuardAtom, { success: "Rule renamed" })
  const form = useForm(UpdateGuard, { ...update, execute: (payload) => update.execute({ id: guard.id, payload }) }, messages)
  const derived = nameFromRule(guard.rule)

  return (
    <FormDialog
      trigger={
        <RowAction label="Rename rule">
          <Pencil />
        </RowAction>
      }
      title="Rename rule"
      description={guard.nameFollowsRule ? "The name follows the rule text until you change it here." : "You named this rule, so editing the rule text keeps this name."}
      submitLabel="Save name"
      form={form}
      input={() => ({ name: name.trim() })}
      onOpenChange={(open) => open && setName(guard.name)}
    >
      <FormField id="guard-rename" label="Name" error={form.errors.name}>
        <Input id="guard-rename" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      {name.trim() !== derived && (
        <Button type="button" variant="link" size="xs" className="w-fit px-0" onClick={() => setName(derived)}>
          Use the rule text as the name
        </Button>
      )}
    </FormDialog>
  )
}

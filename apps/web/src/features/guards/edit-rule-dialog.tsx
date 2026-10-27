import { type Guard, UpdateGuard } from "@pc/domain"
import { PenLine } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { updateGuardAtom } from "./atoms"

const messages = { rule: "Describe the rule (up to 4000 characters)." }

/** New wording means a new question for the classifier, so saving returns the rule to draft. */
export function EditRuleDialog({ guard }: { readonly guard: Guard }) {
  const [rule, setRule] = useState(guard.rule)
  const update = useMutation(updateGuardAtom, { success: "Rule saved as a draft. Verify it to check the new wording." })
  const form = useForm(UpdateGuard, { ...update, execute: (payload) => update.execute({ id: guard.id, payload }) }, messages)

  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          <PenLine />
          Edit
        </Button>
      }
      title="Edit the rule"
      description={
        guard.status === "active"
          ? "Saving switches the rule off and back to draft until you verify, review and activate the new wording."
          : "Saving clears the verified check; verify again to review the new wording."
      }
      submitLabel="Save rule"
      wide
      form={form}
      input={() => ({ rule: rule.trim() })}
      onOpenChange={(open) => open && setRule(guard.rule)}
    >
      <FormField
        id="guard-edit-rule"
        label="Rule"
        error={form.errors.rule}
        description={guard.nameFollowsRule ? "The rule's name follows this text." : `The name stays “${guard.name}”.`}
      >
        <Textarea id="guard-edit-rule" autoFocus rows={3} value={rule} onChange={(e) => setRule(e.target.value)} />
      </FormField>
    </FormDialog>
  )
}

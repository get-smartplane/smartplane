import { type IntegrationAction, type IntegrationConfig, type Resource, UpdateResource } from "@pc/domain"
import { ListChecks } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { updateResourceAtom } from "@/features/resources/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { ActionsPicker } from "../actions/actions-picker"
import { withActions } from "./config-input"

interface EditActionsDialogProps {
  readonly resource: Resource
  readonly config: IntegrationConfig
  /** Every supported action of the piece. */
  readonly offered: ReadonlyArray<IntegrationAction>
}

const messages = { "config.actions": "Choose at least one action, or offer them all." }

/** Narrows which actions this integration offers at all; grants can narrow further per person or team. */
export function EditActionsDialog({ resource, config, offered }: EditActionsDialogProps) {
  const initial = { limit: config.actions !== undefined, actions: config.actions ?? offered.map((action) => action.name) }
  const [limit, setLimit] = useState(initial.limit)
  const [actions, setActions] = useState<ReadonlyArray<string>>(initial.actions)
  const update = useMutation(updateResourceAtom, { success: "Actions saved" })
  const form = useForm(UpdateResource, { ...update, execute: (payload) => update.execute({ id: resource.id, payload }) }, messages)
  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm"><ListChecks />Choose actions</Button>}
      title={`Actions ${resource.name} offers`}
      description="Agents only ever see offered actions they also hold a grant for."
      submitLabel="Save actions"
      wide
      form={form}
      input={() => ({ config: withActions(config, limit ? actions : undefined) })}
      onOpenChange={(open) => {
        if (open) return
        setLimit(initial.limit)
        setActions(initial.actions)
      }}
    >
      <Field orientation="horizontal">
        <Switch id="edit-limit" checked={limit} onCheckedChange={setLimit} />
        <FieldContent>
          <FieldLabel htmlFor="edit-limit">Only offer some actions</FieldLabel>
          <FieldDescription>Off: all {offered.length} supported actions, including ones a newer version adds.</FieldDescription>
        </FieldContent>
      </Field>
      {limit && (
        <FormField id="edit-actions" label="Offered actions" error={form.errors["config.actions"]}>
          <ActionsPicker id="edit-actions" actions={offered} value={actions} onChange={setActions} invalid={form.errors["config.actions"] !== undefined} />
        </FormField>
      )}
    </FormDialog>
  )
}

import { CreateGrant, type ResourceId } from "@pc/domain"
import { Plus } from "lucide-react"
import { useState } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { ResourceSelect } from "@/features/resources/resource-select"
import { useMe } from "@/features/auth/me-context"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { ActionPicker } from "./action-picker"
import { createGrantAtom } from "./atoms"
import { GrantAdvancedFields } from "./grant-advanced-fields"
import { grantSummary } from "./grant-summary"
import { initialGrantDraft, toGrantInput, withResource, type GrantDraft } from "./grant-draft"
import { SubjectPicker } from "./subject-picker"
import { useToolSource, valueTypeOf } from "./tool-source"

const messages = {
  subject: "Choose who gets access.",
  resourceId: "Choose a resource.",
  "conditions.tools": "Add at least one tool, or allow all tools.",
  "conditions.arguments": "Each limit needs a tool, an argument and at least one value.",
  expiresAt: "Enter a valid date."
}

interface CreateGrantDialogProps {
  /** Pre-selects the resource, from that resource's own page. */
  readonly resourceId?: ResourceId
  readonly variant?: "default" | "outline"
}

export function CreateGrantDialog({ resourceId, variant = "default" }: CreateGrantDialogProps) {
  const { principal } = useMe()
  const initial = initialGrantDraft(principal.teamIds, resourceId)
  const [draft, setDraft] = useState<GrantDraft>(initial)
  const set = <K extends keyof GrantDraft>(key: K, value: GrantDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const form = useForm(CreateGrant, useMutation(createGrantAtom, { success: "Access granted" }), messages)
  const source = useToolSource(draft.resourceId)

  return (
    <FormDialog
      trigger={
        <Button variant={variant}>
          <Plus />
          Grant access
        </Button>
      }
      title="Grant access"
      description="Grants only add access. Rules can still stop a single action."
      submitLabel="Grant access"
      wide
      form={form}
      input={() => toGrantInput(draft, valueTypeOf(source))}
      onOpenChange={(open) => open || setDraft(initial)}
    >
      <FormField id="grant-subject" label="Who" error={form.errors.subject}>
        <SubjectPicker
          type={draft.subjectType}
          id={draft.subjectId}
          invalid={form.errors.subject !== undefined}
          onTypeChange={(type) => setDraft((d) => ({ ...d, subjectType: type, subjectId: "" }))}
          onIdChange={(id) => set("subjectId", id)}
        />
      </FormField>
      <FormField id="grant-resource" label="Can reach" error={form.errors.resourceId}>
        <ResourceSelect
          id="grant-resource"
          value={draft.resourceId}
          invalid={form.errors.resourceId !== undefined}
          onChange={(id) => setDraft((d) => withResource(d, id))}
        />
      </FormField>
      <FormField id="grant-action" label="Level">
        <ActionPicker value={draft.action} onChange={(action) => set("action", action)} />
      </FormField>
      <AdvancedOptions
        summary={grantSummary(draft, source)}
        forceOpen={["conditions.tools", "conditions.arguments", "expiresAt"].some((key) => form.errors[key] !== undefined)}
      >
        <GrantAdvancedFields draft={draft} set={set} source={source} errors={form.errors} />
      </AdvancedOptions>
    </FormDialog>
  )
}

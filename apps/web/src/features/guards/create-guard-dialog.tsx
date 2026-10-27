import { CreateGuard, type GuardMode, nameFromRule, type ProjectId, type ResourceId } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { formatPercent } from "@/lib/format"
import { useForm } from "@/lib/forms/use-form"
import { createGuardAtom } from "./atoms"
import { GuardAdvancedFields } from "./guard-advanced-fields"
import { ModeSelect } from "./mode-select"
import { ruleTemplates } from "./rule-templates"

const messages = { name: "Enter a name between 1 and 80 characters.", rule: "Describe the rule (up to 4000 characters)." }

export function CreateGuardDialog() {
  const navigate = useNavigate()
  const [rule, setRule] = useState("")
  const [mode, setMode] = useState<GuardMode>("enforce")
  const [customName, setCustomName] = useState<string>()
  const [threshold, setThreshold] = useState(0.7)
  const [projectId, setProjectId] = useState<ProjectId | null>(null)
  const [resourceIds, setResourceIds] = useState<ReadonlyArray<ResourceId>>([])
  const form = useForm(CreateGuard, useMutation(createGuardAtom, { success: "Rule saved as a draft" }), messages)
  const name = customName ?? nameFromRule(rule)
  // Only a name the person typed is sent; otherwise the API names the rule and keeps the name in step with it.
  const typedName = customName !== undefined && customName.trim() !== "" && customName.trim() !== nameFromRule(rule) ? { name: customName } : {}
  const summary = [projectId === null ? "Whole organization" : "One project", resourceIds.length === 0 ? "every resource" : `${resourceIds.length} resources`, `triggers at ${formatPercent(threshold)}`]

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus />
          New rule
        </Button>
      }
      title="New rule"
      description="Say it in plain English. Next you verify it, check what it will look for, and switch it on."
      submitLabel="Save draft"
      wide
      form={form}
      input={() => ({ ...typedName, rule, mode, threshold, projectId, resourceIds })}
      onSuccess={(guard) => void navigate({ to: "/guards/$guardId", params: { guardId: guard.id } })}
    >
      <FormField id="guard-rule" label="Rule" error={form.errors.rule}>
        <Textarea id="guard-rule" autoFocus rows={3} placeholder="Nobody deletes reports from the Q3 folder." value={rule} onChange={(e) => setRule(e.target.value)} />
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="mr-1 text-xs text-muted-foreground">Start from</span>
          {ruleTemplates.map((template) => (
            <Button
              key={template.label}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setRule(template.rule)
                setMode(template.mode)
              }}
            >
              {template.label}
            </Button>
          ))}
        </div>
      </FormField>
      <FormField id="guard-mode" label="When a call breaks it">
        <ModeSelect id="guard-mode" value={mode} onChange={setMode} />
      </FormField>
      <AdvancedOptions summary={summary.join(" · ")} forceOpen={form.errors.name !== undefined}>
        <GuardAdvancedFields
          name={name}
          onName={setCustomName}
          nameError={form.errors.name}
          threshold={threshold}
          onThreshold={setThreshold}
          projectId={projectId}
          onProject={setProjectId}
          resourceIds={resourceIds}
          onResources={setResourceIds}
        />
      </AdvancedOptions>
    </FormDialog>
  )
}

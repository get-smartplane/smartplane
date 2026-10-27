import { CreateResource, type ProjectId, type Resource } from "@pc/domain"
import { useState, type ReactNode } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { projectsAtom } from "@/features/projects/atoms"
import { ProjectSelect } from "@/features/projects/project-select"
import { createResourceAtom } from "@/features/resources/atoms"
import { emptyDraft, toConfigInput, type ConfigDraft } from "@/features/resources/config-draft"
import { configFields } from "@/features/resources/config-fields"
import { useCreatorAccessNote } from "@/features/resources/creator-access"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"

const copy = {
  secret: {
    title: "Add a secret",
    description: "An API key, token or connection string. Resources reference it; agents never see it.",
    submit: "Add secret",
    added: "Secret added"
  },
  variable: {
    title: "Add a variable",
    description: "A plain configuration value agents can read with variables_get once granted.",
    submit: "Add variable",
    added: "Variable added"
  }
} as const

interface CreateValueDialogProps {
  readonly kind: "secret" | "variable"
  readonly trigger: ReactNode
  /** Suggested name, e.g. from the resource the secret is being made for. */
  readonly initialName?: string
  readonly onCreated?: (resource: Resource) => void
}

/** Creates a secret or a variable: name and value up front, project and description under Advanced. */
export function CreateValueDialog({ kind, trigger, initialName = "", onCreated }: CreateValueDialogProps) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState("")
  const [projectId, setProjectId] = useState<ProjectId | null>(null)
  const [draft, setDraft] = useState<ConfigDraft>(emptyDraft)
  const text = copy[kind]
  const form = useForm(CreateResource, useMutation(createResourceAtom, { success: text.added, successDetail: useCreatorAccessNote(kind) }), {
    name: "Enter a name between 1 and 80 characters."
  })
  const projectName = useQueryData(projectsAtom(false), []).find((project) => project.id === projectId)?.name ?? "Org-wide"
  const { Essential } = configFields[kind]

  const reset = (open: boolean) => {
    if (open) return setName(initialName)
    setDescription("")
    setProjectId(null)
    // Drop a typed secret from memory as soon as the dialog closes.
    setDraft(emptyDraft)
  }

  return (
    <FormDialog
      trigger={trigger}
      title={text.title}
      description={text.description}
      submitLabel={text.submit}
      form={form}
      input={() => ({ name, description, projectId, config: toConfigInput(kind, draft) })}
      onSuccess={(resource) => onCreated?.(resource)}
      onOpenChange={reset}
    >
      <FormField id={`${kind}-name`} label="Name" error={form.errors.name}>
        <Input id={`${kind}-name`} value={name} onChange={(event) => setName(event.target.value)} />
      </FormField>
      <Essential draft={draft} set={(key, value) => setDraft((current) => ({ ...current, [key]: value }))} errors={form.errors} />
      <AdvancedOptions summary={projectName} forceOpen={form.errors.description !== undefined}>
        <FormField id={`${kind}-project`} label="Visible in" description="A project's values are only reachable with tokens scoped to it.">
          <ProjectSelect id={`${kind}-project`} value={projectId} onChange={setProjectId} />
        </FormField>
        <FormField id={`${kind}-description`} label="Description" error={form.errors.description}>
          <Textarea id={`${kind}-description`} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
      </AdvancedOptions>
    </FormDialog>
  )
}

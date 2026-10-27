import { CreateResource, ResourceKind, type ProjectId } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useState } from "react"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { projectsAtom } from "@/features/projects/atoms"
import { ProjectSelect } from "@/features/projects/project-select"
import { SkillSourceAdvanced, SkillSourceFields } from "@/features/skills/create/skill-source-fields"
import { isBundle } from "@/features/skills/create/skill-source"
import { sourceSummary } from "@/features/skills/create/source-summary"
import { SourcePicker } from "@/features/skills/create/source-picker"
import { useSkillSource } from "@/features/skills/create/use-skill-source"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { createResourceAtom } from "./atoms"
import { useCreatorAccessNote } from "./creator-access"
import { emptyDraft, toConfigInput, type ConfigDraft } from "./config-draft"
import { configFields } from "./config-fields"
import { advancedSummary } from "./config-summary"
import { KindPicker } from "./kind-picker"
import { catalogKinds, kindMeta } from "./kinds"
import { McpPresetPicker } from "./mcp-preset-picker"

const messages = { name: "Enter a name between 1 and 80 characters.", "config.url": "Enter an http(s) URL.", "config.baseUrl": "Enter an http(s) URL." }

/** Fields that live under "Advanced"; an error in one of them opens it. */
const advancedKeys: ReadonlySet<string> = new Set(["description", "projectId", "config.transport", "config.authSecretId", "config.auth", "config.auth.secretId", "config.authHeader", "config.allowedMethods", "config.allowedPaths", "config.engine", "config.actions", "config.arguments", "tokenSecretId"])

export function CreateResourceDialog({ initialKind }: { readonly initialKind: ResourceKind | undefined }) {
  const [kind, setKind] = useState<ResourceKind>(initialKind ?? "mcp_server")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [projectId, setProjectId] = useState<ProjectId | null>(null)
  const [draft, setDraft] = useState<ConfigDraft>(emptyDraft)
  const form = useForm(CreateResource, useMutation(createResourceAtom, { success: `${kindMeta[kind].label} added`, successDetail: useCreatorAccessNote(kind) }), messages)
  const projectName = useQueryData(projectsAtom(false), []).find((project) => project.id === projectId)?.name ?? "Org-wide"
  const { Essential, Advanced } = configFields[kind]
  // GitHub, link and upload skills are fetched into versions by /api/skills; "Write" stays a plain resource.
  const skill = useSkillSource({ name, description, projectId })
  const bundle = kind === "skill" && isBundle(skill.source)
  const navigate = useNavigate()
  const active = bundle ? skill.form : form
  const set = <K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const reset = (open: boolean) => {
    if (open) return setKind(initialKind ?? "mcp_server")
    setName("")
    setDescription("")
    setProjectId(null)
    skill.reset()
    // Drop any typed secret from memory as soon as the dialog closes.
    setDraft(emptyDraft)
  }

  return (
    <FormDialog
      trigger={
        <Button>
          <Plus />
          Add resource
        </Button>
      }
      title="Add a resource"
      description={kindMeta[kind].description}
      submitLabel={bundle ? (skill.form.pending ? "Adding skill…" : "Add skill") : "Add resource"}
      wide
      form={active}
      input={() => ({ name, description, projectId, config: toConfigInput(kind, draft) })}
      onSuccess={(resource) => bundle && void navigate({ to: "/resources/$resourceId", params: { resourceId: resource.id } })}
      onOpenChange={reset}
    >
      {/* Secrets and variables are added on their own page, or a secret inline where a field needs one. */}
      <KindPicker value={kind} onChange={setKind} kinds={catalogKinds} />
      {kind === "skill" && <SourcePicker value={skill.source} onChange={skill.setSource} />}
      {kind === "mcp_server" && (
        <McpPresetPicker
          onPick={(preset) => {
            setName(preset.name)
            set("url", preset.url)
          }}
        />
      )}
      <FormField id="resource-name" label="Name" error={active.errors.name}>
        <Input id="resource-name" value={name} onChange={(event) => setName(event.target.value)} />
      </FormField>
      {bundle ? <SkillSourceFields state={skill} /> : <Essential draft={draft} set={set} errors={form.errors} />}
      <AdvancedOptions
        summary={bundle ? sourceSummary(skill.source, skill.draft, projectName) : advancedSummary(kind, draft, projectName)}
        forceOpen={Object.keys(active.errors).some((key) => advancedKeys.has(key))}
      >
        <FormField id="resource-project" label="Visible in" description="A project's resources are only reachable with tokens scoped to it.">
          <ProjectSelect id="resource-project" value={projectId} onChange={setProjectId} />
        </FormField>
        {bundle ? <SkillSourceAdvanced state={skill} /> : Advanced && <Advanced draft={draft} set={set} errors={form.errors} />}
        <FormField id="resource-description" label="Description" error={active.errors.description} description={bundle ? "Leave blank to use the description in SKILL.md." : undefined}>
          <Textarea id="resource-description" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
      </AdvancedOptions>
    </FormDialog>
  )
}

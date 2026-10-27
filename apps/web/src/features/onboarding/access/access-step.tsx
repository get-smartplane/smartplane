import { type Action, CreateGrant } from "@pc/domain"
import { ShieldCheck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ActionPicker } from "@/features/access/action-picker"
import { createGrantAtom } from "@/features/access/atoms"
import { allResourcesAtom } from "@/features/resources/atoms"
import { teamsAtom } from "@/features/teams/atoms"
import { ResourceSelect } from "@/features/resources/resource-select"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { StepFrame } from "../setup/step-frame"
import type { SetupController } from "../setup/use-setup"
import { ToolBadge } from "../tool/tool-badge"
import { ActionWords } from "./action-words"
import { Cabin } from "./cabin"
import { type Audience, WhoPicker } from "./who-picker"

const messages = { subject: "Choose a team, or grant everyone.", resourceId: "Choose a tool to grant." }

export function AccessStep({ controller }: { readonly controller: SetupController }) {
  const resources = useQueryData(allResourcesAtom, [])
  const teams = useQueryData(teamsAtom, [])
  // Derived, not seeded: the step can mount before saving step 1's tool has landed in `controller.setup`.
  const [chosenId, setResourceId] = useState<string | null>(null)
  const resourceId = chosenId ?? controller.setup.toolResourceId ?? ""
  const [audience, setAudience] = useState<Audience>("everyone")
  const [teamId, setTeamId] = useState("")
  const [level, setLevel] = useState<Action>("use")
  const form = useForm(CreateGrant, useMutation(createGrantAtom, { success: "Access granted" }), messages)
  const resource = resources.find((candidate) => candidate.id === resourceId)
  const fromStepOne = resource !== undefined && resource.id === controller.setup.toolResourceId
  const cabin = <Cabin audience={audience} teamName={teams.find((team) => team.id === teamId)?.name} />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const subject = audience === "everyone" ? { type: "role", role: "member" } : { type: "team", id: teamId }
    const granted = await form.submit({ subject, resourceId, action: level, conditions: {}, expiresAt: null })
    if (granted) await controller.finish("done")
  }

  return (
    <StepFrame
      index={1}
      title="Decide who can use it"
      description="A grant lets people's agents use a tool, at a level. Rules can still stop a single action."
      onBack={() => controller.go("tool")}
      onSkip={() => void controller.finish("skipped")}
      skipping={controller.saving}
      primary={
        <Button type="submit" form="setup-access" disabled={form.pending || resources.length === 0}>
          {form.pending ? <Spinner /> : <ShieldCheck />}
          Grant access
        </Button>
      }
    >
      <form id="setup-access" onSubmit={submit} noValidate className="flex flex-col gap-6">
        {fromStepOne ? (
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4">
            <ToolBadge resource={resource} />
            {cabin}
          </div>
        ) : (
          <FormField id="setup-grant-resource" label="Tool" error={form.errors.resourceId} description={resources.length === 0 ? "Connect a tool first, or skip this step." : undefined}>
            <ResourceSelect id="setup-grant-resource" value={resourceId} invalid={form.errors.resourceId !== undefined} onChange={setResourceId} />
          </FormField>
        )}
        {!fromStepOne && cabin}
        <FormField id="setup-grant-who" label="Who" error={form.errors.subject}>
          <WhoPicker audience={audience} teamId={teamId} onAudience={setAudience} onTeam={setTeamId} invalid={form.errors.subject !== undefined} />
        </FormField>
        <FormField id="grant-action" label="Level">
          <ActionPicker value={level} onChange={setLevel} />
        </FormField>
        {resource && <ActionWords resource={resource} level={level} />}
      </form>
    </StepFrame>
  )
}

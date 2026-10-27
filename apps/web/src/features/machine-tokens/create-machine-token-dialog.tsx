import { CreateMachineToken, MaxTokenTtlDays, type CreatedMachineToken, type ProjectId, type Resource, type ResourceId } from "@pc/domain"
import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { ProjectSelect } from "@/features/projects/project-select"
import { allResourcesAtom } from "@/features/resources/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { AllowListPicker, inTokenScope } from "./allow-list-picker"
import { createMachineTokenAtom } from "./atoms"
import { MachineTokenReveal } from "./machine-token-reveal"

interface Draft {
  readonly name: string
  readonly projectId: ProjectId | null
  readonly allow: ReadonlyArray<ResourceId>
  readonly ttlDays: number
}

const initialDraft: Draft = { name: "", projectId: null, allow: [], ttlDays: MaxTokenTtlDays }
const messages = {
  name: "Name the service, between 1 and 80 characters.",
  allow: "Choose at least one secret or variable.",
  ttlDays: `Choose between 1 and ${MaxTokenTtlDays} days.`
}
const none: ReadonlyArray<Resource> = []

/** Creates a machine token for one service, then shows its plaintext and setup once. */
export function CreateMachineTokenDialog({ variant = "default" }: { readonly variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initialDraft)
  const [created, setCreated] = useState<CreatedMachineToken>()
  const form = useForm(CreateMachineToken, useMutation(createMachineTokenAtom, { success: "Machine token created" }), messages)
  const resources = useQueryData(allResourcesAtom, none)
  const candidates = resources.filter((resource) => inTokenScope(resource, draft.projectId))

  const changeOpen = (next: boolean) => {
    setOpen(next)
    if (next) return
    // The plaintext lives only in this component's state; closing discards it for good.
    setCreated(undefined)
    setDraft(initialDraft)
    form.reset()
  }

  /** Narrowing the project drops choices the token could no longer reach, rather than failing on submit. */
  const changeProject = (projectId: ProjectId | null) => {
    const reachable = new Set(resources.filter((resource) => inTokenScope(resource, projectId)).map((resource) => resource.id))
    setDraft({ ...draft, projectId, allow: draft.allow.filter((id) => reachable.has(id)) })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setCreated(await form.submit({ name: draft.name, projectId: draft.projectId, allow: draft.allow, ttlDays: draft.ttlDays }))
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus />
          New machine token
        </Button>
      </DialogTrigger>
      {/* The plaintext is shown once: a stray click outside must not discard it. */}
      <DialogContent className={created ? "max-h-[92svh] overflow-y-auto sm:max-w-2xl" : "sm:max-w-xl"} onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{created ? `${created.token.name} is ready` : "New machine token"}</DialogTitle>
          <DialogDescription>
            {created
              ? "Hand the setup to your coding agent, or follow the steps for your platform. Then remove the real secrets from its settings."
              : "For one deployed service. It can only receive the values you choose here, and nothing else."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <MachineTokenReveal created={created} />
            <DialogFooter>
              <Button onClick={() => changeOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-6">
            <FieldGroup className="max-h-[62svh] overflow-y-auto px-0.5">
              <FormField id="mtk-name" label="Service" error={form.errors.name} description="One token per service, so revoking one stops only that service.">
                <Input id="mtk-name" autoFocus placeholder="billing-api (Railway)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </FormField>
              <FormField id="mtk-project" label="Project" description="A project token reaches org-wide values and that project's only.">
                <ProjectSelect id="mtk-project" value={draft.projectId} onChange={changeProject} orgWideLabel="No project (org-wide)" />
              </FormField>
              {/* Not a FormField: its invalid state would paint every choice red, not just the message. */}
              <div className="flex min-w-0 flex-col gap-2">
                <Label id="mtk-allow-label" asChild>
                  <span>Can receive</span>
                </Label>
                <AllowListPicker
                  id="mtk-allow"
                  candidates={candidates}
                  value={draft.allow}
                  invalid={form.errors.allow !== undefined}
                  onChange={(allow) => setDraft({ ...draft, allow })}
                />
                {form.errors.allow ? (
                  <p role="alert" className="text-sm text-danger-ink">{form.errors.allow}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <span className="tabular-nums">{draft.allow.length}</span> chosen. Only deliverable secrets, and variables, can be chosen.
                  </p>
                )}
              </div>
              <FormField id="mtk-ttl" label="Expires after (days)" error={form.errors.ttlDays} description={`1 to ${MaxTokenTtlDays} days. Renew it before then; the token stays the same.`}>
                <Input
                  id="mtk-ttl"
                  type="number"
                  min={1}
                  max={MaxTokenTtlDays}
                  className="w-28"
                  value={Number.isNaN(draft.ttlDays) ? "" : draft.ttlDays}
                  aria-invalid={form.errors.ttlDays !== undefined}
                  onChange={(e) => setDraft({ ...draft, ttlDays: e.target.valueAsNumber })}
                />
              </FormField>
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={form.pending}>
                {form.pending && <Spinner />}
                Create token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

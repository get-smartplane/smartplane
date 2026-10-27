import { useAtomValue } from "@effect/atom-react"
import { isCreatorGrant, type OrgSetup, type SetupStep, type SetupStepState } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { ArrowRight, Check, Minus, X } from "lucide-react"
import { AsyncResult } from "effect/reactivity"
import { useQueryData } from "@/components/query/use-query-data"
import { PaperPlane } from "@/components/sky/paper-plane"
import { Button } from "@/components/ui/button"
import { grantsAtom } from "@/features/access/atoms"
import { guardsAtom } from "@/features/guards/atoms"
import { membersAtom } from "@/features/members/atoms"
import { allResourcesAtom } from "@/features/resources/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { progressAtom, updateSetupAtom } from "./atoms"
import { setupSteps } from "./setup/steps"

/** A step also counts as done when the org already has the thing, however it was added. */
const useEffectiveSteps = (setup: OrgSetup): { readonly [S in SetupStep]: SetupStepState } => {
  const resources = useQueryData(allResourcesAtom, [])
  const has = {
    tool: resources.some((resource) => resource.config.kind !== "secret" && resource.config.kind !== "variable"),
    // A creator's own grant comes with every new tool; the step is about giving someone else access.
    access: useQueryData(grantsAtom, []).some((grant) => !isCreatorGrant(grant, resources.find((resource) => resource.id === grant.resourceId))),
    rule: useQueryData(guardsAtom, []).some((guard) => guard.status === "active"),
    team: useQueryData(membersAtom, []).length > 1,
    agent: false
  }
  const pick = (id: SetupStep): SetupStepState => (has[id] ? "done" : setup.steps[id])
  return { tool: pick("tool"), access: pick("access"), rule: pick("rule"), team: pick("team"), agent: pick("agent") }
}

function Card({ setup }: { readonly setup: OrgSetup }) {
  const steps = useEffectiveSteps(setup)
  const dismiss = useMutation(updateSetupAtom, { success: "Setup checklist hidden" })
  const done = setupSteps.filter(({ id }) => steps[id] === "done").length
  const next = setupSteps.find(({ id }) => steps[id] === "todo") ?? setupSteps.find(({ id }) => steps[id] === "skipped")
  if (next === undefined) return null
  return (
    <section aria-labelledby="finish-setup" className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:gap-6">
      <PaperPlane className="hidden w-16 shrink-0 -rotate-6 sm:block" strokeWidth={4} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="finish-setup" className="font-display text-[1.0625rem] leading-6">Finish setup</h2>
            <p className="text-sm text-muted-foreground tabular">{done} of {setupSteps.length} done. Next: {next.title.toLowerCase()}.</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Hide the setup checklist" disabled={dismiss.pending} onClick={() => void dismiss.execute({ status: "dismissed" })}>
            <X />
          </Button>
        </div>
        <ol className="flex flex-wrap gap-x-4 gap-y-1.5">
          {setupSteps.map(({ id, label }) => (
            <li key={id}>
              <Link to="/setup" search={{ step: id }} className="flex items-center gap-1.5 rounded-sm text-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                {steps[id] === "done" ? <Check className="size-3.5 text-brand" aria-label="Done" /> : steps[id] === "skipped" ? <Minus className="size-3.5 text-muted-foreground" aria-label="Skipped" /> : <span aria-label="To do" className="size-2.5 rounded-full border-2 border-foreground/40" />}
                <span className={steps[id] === "done" ? "text-muted-foreground" : ""}>{label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
      <Button className="w-fit shrink-0" asChild>
        <Link to="/setup" search={{ step: next.id }}>
          Resume setup
          <ArrowRight />
        </Link>
      </Button>
    </section>
  )
}

/** The overview's checklist while the org's setup is open; gone once it is completed or hidden. */
export function FinishSetupCard() {
  const progress = useAtomValue(progressAtom)
  if (!AsyncResult.isSuccess(progress)) return null
  const setup = progress.value.setup
  return setup === null || setup.status !== "open" ? null : <Card setup={setup} />
}

import { type Guard, type GuardVerifyRun, scoreSelfTest, verifyActive } from "@pc/domain"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { cancelVerifyAtom } from "../atoms"
import { useNow } from "./use-now"
import { formatElapsed, pollingFor, runElapsedMs } from "./verify-state"
import { VerifyStepper } from "./verify-stepper"

const reached = (run: GuardVerifyRun, stage: GuardVerifyRun["stage"]) => run.timeline.some((step) => step.stage === stage)

/** One line under a finished stage, from what it saved; only once the run's own draft is there. */
const detailsFor = (guard: Guard, run: GuardVerifyRun) => {
  const compiled = guard.compiled
  if (compiled === null || !reached(run, "reviewing")) return {}
  const targets = compiled.grounding?.targets ?? []
  const tools = targets.reduce((sum, target) => sum + target.toolCount, 0)
  const selfTest = compiled.selfTest?.jobId === run.runId ? compiled.selfTest : undefined
  const score = selfTest === undefined || selfTest.calls.length === 0 ? undefined : scoreSelfTest(selfTest.calls)
  const recompiled = selfTest?.recompiled
  const scored = score === undefined ? undefined : `${score.caught} of ${score.violating} caught · ${score.allowed} of ${score.allowedTotal} allowed`
  const mistakes = (count: number) => (count === 1 ? "1 call" : `${count} calls`)
  const testing = recompiled !== undefined ? `v${recompiled.fromVersion} misjudged ${mistakes(recompiled.mistakes)}` : selfTest?.status === "running" && score !== undefined ? `${mistakes(score.mistakes.length)} misjudged` : scored
  const retrying = recompiled !== undefined ? `v${guard.compiledVersion} tested better: ${scored ?? ""}` : run.stage === "done" && reached(run, "retrying") ? `Kept v${guard.compiledVersion}: the recompile did not do better` : undefined
  return {
    finding_targets: targets.length === 0 ? "No specific system: it checks every resource in its scope" : `${targets.map((target) => target.product).join(", ")} · ${tools} tools`,
    drafting: `Draft v${recompiled?.fromVersion ?? guard.compiledVersion}`,
    ...(testing === undefined ? {} : { testing }),
    ...(retrying === undefined ? {} : { retrying })
  }
}

const heading = (run: GuardVerifyRun) => {
  switch (run.stage) {
    case "done":
      return "Verified"
    case "failed":
      return "Verify did not finish"
    case "cancelled":
      return "Verify cancelled"
    case "needs_confirmation":
      return "Waiting for you"
    default:
      return "Verifying"
  }
}

/** The run on the rule page: what stage it is at, how long it has taken, and a way to stop it. */
export function VerifyPanel({ guard, run }: { readonly guard: Guard; readonly run: GuardVerifyRun }) {
  const active = verifyActive(run)
  const now = useNow(active)
  const cancel = useMutation(cancelVerifyAtom, { success: "Verify cancelled. What it already saved stays." })
  const stale = pollingFor(guard, now) === "stale"
  return (
    <section aria-label="Verify" className="flex flex-col gap-3 rounded-lg border p-3.5">
      <header className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{heading(run)}</h3>
        <span className="text-xs text-muted-foreground tabular">{formatElapsed(runElapsedMs(run, now))}</span>
        {active && (
          <Button size="sm" variant="ghost" className="ml-auto h-7" disabled={cancel.pending} onClick={() => void cancel.execute(guard.id)}>
            {cancel.pending && <Spinner />}
            Cancel
          </Button>
        )}
      </header>
      <VerifyStepper run={run} now={now} detail={detailsFor(guard, run)} />
      {run.stage === "needs_confirmation" && (
        <p className="text-sm text-muted-foreground">The rule names something specific. Choose it below (or say none of these) and testing goes on; you can also test without pinning.</p>
      )}
      {stale && (
        <p className="flex items-start gap-2 text-sm text-warning-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>This is taking much longer than usual. Cancel it and verify again.</span>
        </p>
      )}
    </section>
  )
}

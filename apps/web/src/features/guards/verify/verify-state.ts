import { type Guard, type GuardVerifyRun, type GuardVerifyStage, selfTestRunning, stageIndex, terminalStages } from "@pc/domain"

/** The stepper's stages and words. "Improving" and the confirmation only appear when the run went through them. */
const labels: Partial<Record<GuardVerifyStage, string>> = {
  finding_targets: "Finding the tools it applies to",
  drafting: "Writing the check",
  reviewing: "Reviewing",
  needs_confirmation: "Confirming what it names",
  testing: "Testing on example calls",
  retrying: "Improving",
  done: "Done"
}

export type StepState = "done" | "active" | "waiting" | "pending" | "failed" | "cancelled"

export interface VerifyStep {
  readonly stage: GuardVerifyStage
  readonly label: string
  readonly state: StepState
  /** How long it took, once it ended. */
  readonly tookMs?: number
  /** When the stage started, while it runs. */
  readonly startedMs?: number
}

const reached = (run: GuardVerifyRun, stage: GuardVerifyStage) => run.timeline.some((step) => step.stage === stage)

/** `queued` is shown as the first stage starting. */
const currentStage = (run: GuardVerifyRun): GuardVerifyStage => (run.stage === "queued" ? "finding_targets" : run.stage)

/** The rows to draw for a run, in order, each with its state and timing. */
export const stepsFor = (run: GuardVerifyRun): ReadonlyArray<VerifyStep> => {
  const visible: ReadonlyArray<GuardVerifyStage> = [
    "finding_targets",
    "drafting",
    "reviewing",
    ...(reached(run, "needs_confirmation") ? ["needs_confirmation" as const] : []),
    "testing",
    ...(reached(run, "retrying") ? ["retrying" as const] : []),
    "done"
  ]
  const current = currentStage(run)
  const ended = terminalStages.includes(run.stage) && run.stage !== "done"
  // Where a failed or cancelled run stopped: the last working stage it reached.
  const stoppedAt = ended ? [...run.timeline].reverse().find((step) => step.stage !== run.stage && step.stage !== "queued")?.stage ?? "finding_targets" : undefined
  return visible.map((stage): VerifyStep => {
    const label = labels[stage] ?? stage
    const index = run.timeline.findIndex((step) => step.stage === stage)
    const started = run.timeline[index]
    const next = index >= 0 ? run.timeline[index + 1] : undefined
    const tookMs = started !== undefined && next !== undefined ? next.at.epochMilliseconds - started.at.epochMilliseconds : undefined
    if (stoppedAt !== undefined) {
      if (stage === stoppedAt) return { stage, label, state: run.stage === "failed" ? "failed" : "cancelled" }
      return index >= 0 && stageIndex(stage) < stageIndex(stoppedAt) ? { stage, label, state: "done", ...(tookMs === undefined ? {} : { tookMs }) } : { stage, label, state: "pending" }
    }
    if (run.stage === "done") return { stage, label, state: "done", ...(tookMs === undefined ? {} : { tookMs }) }
    if (stage === current) return { stage, label, state: stage === "needs_confirmation" ? "waiting" : "active", ...(started === undefined ? {} : { startedMs: started.at.epochMilliseconds }) }
    return stageIndex(stage) < stageIndex(current) ? { stage, label, state: "done", ...(tookMs === undefined ? {} : { tookMs }) } : { stage, label, state: "pending" }
  })
}

/** A stage normally ends within a few minutes; past this the page stops asking and offers to start again. */
export const StaleAfterMs = 10 * 60 * 1000

/**
 * What the page does about a rule: `poll` while a run (or an older background self-test) is working,
 * `waiting` while a run waits for a person, `stale` when it has not moved for too long, else `idle`.
 */
export const pollingFor = (guard: Guard, now: number): "poll" | "waiting" | "stale" | "idle" => {
  const run = guard.verify
  if (run !== null && !terminalStages.includes(run.stage)) {
    if (run.stage === "needs_confirmation") return "waiting"
    return now - run.updatedAt.epochMilliseconds < StaleAfterMs ? "poll" : "stale"
  }
  const selfTest = guard.compiled?.selfTest
  if (run === null && selfTestRunning(selfTest)) {
    const started = selfTest?.startedAt?.epochMilliseconds ?? now
    return now - started < StaleAfterMs ? "poll" : "stale"
  }
  return "idle"
}

/** "8 s", "1:05". */
export const formatElapsed = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/** From the start of the run to its end, or to `now` while it runs. */
export const runElapsedMs = (run: GuardVerifyRun, now: number): number =>
  (terminalStages.includes(run.stage) ? run.updatedAt.epochMilliseconds : now) - run.startedAt.epochMilliseconds

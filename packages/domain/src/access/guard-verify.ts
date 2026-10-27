import { Schema } from "effect"
import { Timestamp } from "../primitives"

/**
 * Where a verify run is. It moves forward in this order and each stage is saved as it starts, so the rule
 * page can show it: `queued` (accepted, not picked up yet), `finding_targets` (the systems the rule names,
 * their tools, the specific thing it names, re-checking pins), `drafting` (the model writes the check),
 * `reviewing` (deterministic review, at most one correction), `needs_confirmation` (paused until an admin
 * confirms or skips what the lookup found), `testing` (example calls through the classifier), `retrying`
 * (one recompile when the test found mistakes), then `done`, `failed` or `cancelled`.
 */
export const GuardVerifyStage = Schema.Literals([
  "queued",
  "finding_targets",
  "drafting",
  "reviewing",
  "needs_confirmation",
  "testing",
  "retrying",
  "done",
  "failed",
  "cancelled"
]).annotate({ identifier: "GuardVerifyStage" })
export type GuardVerifyStage = typeof GuardVerifyStage.Type

/** When a stage started, for the stepper's timings. */
export const GuardVerifyStep = Schema.Struct({ stage: GuardVerifyStage, at: Timestamp }).annotate({ identifier: "GuardVerifyStep" })
export type GuardVerifyStep = typeof GuardVerifyStep.Type

/**
 * One verify run of a rule, run in the background. A newer run replaces it, a rule edit or Cancel ends it,
 * and a run that is no longer the guard's current one can never write to it. Nothing here activates a rule.
 */
export const GuardVerifyRun = Schema.Struct({
  runId: Schema.NonEmptyString.check(Schema.isMaxLength(40)),
  stage: GuardVerifyStage,
  startedAt: Timestamp,
  /** When the current stage started (or the run ended). */
  updatedAt: Timestamp,
  /** Every stage so far, in order. */
  timeline: Schema.Array(GuardVerifyStep),
  /** Why it failed or was cancelled, in words for the admin. Never secret. */
  error: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(300))),
  /** Something worth saying about a run that ended well, e.g. that a prepared rule needed none. Never secret. */
  note: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(300)))
}).annotate({ identifier: "GuardVerifyRun" })
export type GuardVerifyRun = typeof GuardVerifyRun.Type

export const terminalStages: ReadonlyArray<GuardVerifyStage> = ["done", "failed", "cancelled"]

/** The run is still going (or waiting for a confirmation): the page polls and Verify is disabled. */
export const verifyActive = (run: GuardVerifyRun | null | undefined): boolean =>
  run !== null && run !== undefined && !terminalStages.includes(run.stage)

/** Stage order, for "is this stage behind or ahead of that one". */
export const stageIndex = (stage: GuardVerifyStage): number => GuardVerifyStage.literals.indexOf(stage)

/** What each working stage is called on the rule page and in the CLI. */
export const verifyStageLabel: Readonly<Record<GuardVerifyStage, string>> = {
  queued: "Starting",
  finding_targets: "Finding the tools it applies to",
  drafting: "Writing the check",
  reviewing: "Reviewing",
  needs_confirmation: "Waiting for you to confirm what it names",
  testing: "Testing on example calls",
  retrying: "Improving",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled"
}

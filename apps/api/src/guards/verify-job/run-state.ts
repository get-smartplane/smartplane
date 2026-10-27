import type { DateTime } from "effect"
import { type GuardVerifyRun, type GuardVerifyStage, terminalStages } from "@pc/domain"
import type { RunCondition } from "../guards-repo"

/** Stages a run can still be ended from (cancelled, failed). */
export const liveStages: ReadonlyArray<GuardVerifyStage> = ["queued", "finding_targets", "drafting", "reviewing", "needs_confirmation", "testing", "retrying"]

export const newRun = (runId: string, now: DateTime.Utc): GuardVerifyRun => ({ runId, stage: "queued", startedAt: now, updatedAt: now, timeline: [{ stage: "queued", at: now }] })

/** The run moved on to `stage`, which starts now. */
export const advance = (run: GuardVerifyRun, stage: GuardVerifyStage, now: DateTime.Utc, error?: string): GuardVerifyRun => ({
  runId: run.runId,
  stage,
  startedAt: run.startedAt,
  updatedAt: now,
  timeline: [...run.timeline, { stage, at: now }],
  ...(error === undefined ? {} : { error: error.slice(0, 300) })
})

/** A write for the stage that is running now: it lands only while the stored run is still at that stage. */
export const atStage = (run: GuardVerifyRun, stage: GuardVerifyStage = run.stage): RunCondition => ({ runId: run.runId, inStages: [stage] })

/** A write that ends the run: it lands while the run is anywhere short of an end. */
export const whileLive = (runId: string): RunCondition => ({ runId, inStages: liveStages })

export const isTerminal = (stage: GuardVerifyStage) => terminalStages.includes(stage)

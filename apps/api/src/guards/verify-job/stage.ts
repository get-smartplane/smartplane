import type { Guard, GuardVerifyRun, GuardVerifyStage, ModelTimedOut, NotFound, Principal, UpstreamFailure } from "@pc/domain"
import type { VerifyJob } from "./job"

/** What a stage works from: the guard as stored now (carrying this run), the job so far, and the admin as they are now. */
export interface StageInput {
  readonly guard: Guard
  readonly run: GuardVerifyRun
  readonly job: VerifyJob
  readonly principal: Principal
  /** The queue will not try this stage again: degrade (keep what is there) rather than fail, where that is honest. */
  readonly lastAttempt: boolean
}

export interface StageAudit {
  readonly type: "guard.compiled" | "guard.tested"
  readonly data: Readonly<Record<string, unknown>>
}

/** What a stage produced: the guard to save with the run moved to `next`, the job, and what to audit once saved. */
export interface StageOutput {
  readonly next: GuardVerifyStage
  readonly guard: Guard
  readonly job: VerifyJob
  readonly audit?: ReadonlyArray<StageAudit>
  /** A recompile replaces instructions: only save it while the rule is still a draft nobody activated. */
  readonly onlyDraft?: boolean
}

/** All retried by the queue; `NotFound` (the job or the draft it needs is not in KV) reads as "expired" on the last try. */
export type StageError = UpstreamFailure | ModelTimedOut | NotFound

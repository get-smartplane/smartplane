import { Conflict, type Guard, type UpstreamFailure, type Forbidden, type Principal, verifyActive } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { GuardsRepo } from "../guards-repo"
import { newRunId, VerifyJobs } from "./job"
import { VerifyPrincipals } from "./requester"
import { advance, newRun, whileLive } from "./run-state"

/**
 * Starting, cancelling and resuming verify runs from requests. Starting records the run on the guard and
 * queues it, and answers at once; the stages run in the queue consumer (`VerifyRunner`). Callers check
 * permissions; these only keep the run's state consistent.
 */
export class VerifyRuns extends Context.Service<VerifyRuns, {
  /** A new run replaces whatever ran: an older run's writes are refused from now on. */
  readonly start: (principal: Principal, guard: Guard) => Effect.Effect<Guard, Forbidden | UpstreamFailure>
  /** Ends a live run (Cancel, or the rule it verifies changed); `reason` is shown with it. */
  readonly cancel: (guard: Guard, reason: string) => Effect.Effect<Guard, Conflict>
  /** Goes on testing a run paused at `needs_confirmation`; a guard whose run is elsewhere is returned unchanged. */
  readonly resume: (guard: Guard) => Effect.Effect<Guard, UpstreamFailure>
}>()("api/guards/VerifyRuns") {
  static readonly layer = Layer.effect(
    VerifyRuns,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const jobs = yield* VerifyJobs
      const principals = yield* VerifyPrincipals

      const failStart = (guard: Guard, run: NonNullable<Guard["verify"]>) =>
        Effect.gen(function*() {
          const failed = advance(run, "failed", yield* DateTime.now, "Verify could not be started. Try again.")
          yield* guards.setRun(guard.orgId, guard.id, failed, whileLive(run.runId))
        })

      const start = Effect.fn("VerifyRuns.start")(function*(principal: Principal, guard: Guard) {
        const requester = yield* principals.requesterOf(principal)
        const run = newRun(newRunId(), yield* DateTime.now)
        yield* jobs.save({ runId: run.runId, orgId: guard.orgId, guardId: guard.id, requester })
        yield* guards.setRun(guard.orgId, guard.id, run)
        yield* jobs.enqueue({ orgId: guard.orgId, guardId: guard.id, runId: run.runId, stage: "queued", attempt: 1 }).pipe(
          Effect.tapError(() => failStart(guard, run))
        )
        yield* Effect.annotateCurrentSpan({ "guard.id": guard.id, "guard.run": run.runId })
        return { ...guard, verify: run } satisfies Guard
      })

      const cancel = Effect.fn("VerifyRuns.cancel")(function*(guard: Guard, reason: string) {
        const run = guard.verify
        if (run === null || !verifyActive(run)) return yield* new Conflict({ message: "no verify is running for this rule" })
        const cancelled = advance(run, "cancelled", yield* DateTime.now, reason)
        const changed = yield* guards.setRun(guard.orgId, guard.id, cancelled, whileLive(run.runId))
        if (!changed) return yield* new Conflict({ message: "this verify has already finished" })
        return { ...guard, verify: cancelled } satisfies Guard
      })

      const resume = Effect.fn("VerifyRuns.resume")(function*(guard: Guard) {
        const run = guard.verify
        if (run?.stage !== "needs_confirmation") return guard
        const testing = advance(run, "testing", yield* DateTime.now)
        if (!(yield* guards.setRun(guard.orgId, guard.id, testing, { runId: run.runId, inStages: ["needs_confirmation"] }))) return guard
        yield* jobs.enqueue({ orgId: guard.orgId, guardId: guard.id, runId: run.runId, stage: "testing", attempt: 1 }).pipe(Effect.tapError(() => failStart(guard, testing)))
        return { ...guard, verify: testing } satisfies Guard
      })

      return VerifyRuns.of({ start, cancel, resume })
    })
  )
}

import { type Forbidden, type GuardVerifyStage, NotFound, UpstreamFailure } from "@pc/domain"
import { Context, DateTime, Duration, Effect, Layer, Option } from "effect"
import { actorOf } from "../../audit/actor"
import { AuditLog } from "../../audit/audit-log"
import { MembersRepo } from "../../org/members-repo"
import { RolesRepo } from "../../org/roles-repo"
import { TeamsRepo } from "../../org/teams-repo"
import { ResourcesRepo } from "../../resources/resources-repo"
import { Classifier } from "../classifier"
import { GuardCompiler } from "../compiler"
import { ExampleCalls } from "../examples/example-calls"
import { makeGuardDirectory } from "../guard-directory"
import { GuardsRepo } from "../guards-repo"
import { PinChildren } from "../pinning/children-store"
import { GuardVerifier } from "../verify"
import { draftStages } from "./draft-stages"
import { type VerifyJob, VerifyJobs, type VerifyMessage } from "./job"
import { VerifyPrincipals } from "./requester"
import { advance, atStage, isTerminal, whileLive } from "./run-state"
import type { StageError } from "./stage"
import { testStages } from "./test-stages"

/**
 * Each stage's ceiling, over the model calls' own timeouts inside it (a draft 30 s, a patient recompile 60 s
 * per draft, example calls 60 s, Clef 10 s per call six at a time on at most 30 calls, a pin lookup 15 s). The
 * sum (~9 min) stays inside a queue consumer's 15 min wall time even if one invocation runs every stage.
 */
export const StageTimeouts: Readonly<Record<RunningStage, Duration.Duration>> = {
  queued: Duration.seconds(10),
  finding_targets: Duration.seconds(60),
  drafting: Duration.seconds(45),
  reviewing: Duration.seconds(45),
  testing: Duration.seconds(150),
  retrying: Duration.seconds(240)
}

export type RunningStage = "queued" | "finding_targets" | "drafting" | "reviewing" | "testing" | "retrying"

/** What one step did: moved the run to `stage` (which has started), paused it for an admin, ended it, or found it stale. */
export type StepOutcome =
  | { readonly _tag: "advanced"; readonly stage: RunningStage; readonly job: VerifyJob }
  | { readonly _tag: "paused" }
  | { readonly _tag: "finished" }
  | { readonly _tag: "stale" }

const running = (stage: GuardVerifyStage): stage is RunningStage => stage in StageTimeouts

/**
 * Runs verify in the background, one stage per step. A step reads the run from the guard (the truth), runs
 * that stage as the verifying admin, and saves its results together with the next stage, only while the
 * guard still carries this run at this stage: a newer verify, Cancel or a rule edit turns every later write
 * of an older run into a no-op. Nothing here activates a rule or pins anything.
 */
export class VerifyRunner extends Context.Service<VerifyRunner, {
  /** `job`: the job as the previous step left it, saving a KV read (and a stale replica) within one invocation. */
  readonly step: (message: VerifyMessage, job?: VerifyJob) => Effect.Effect<StepOutcome, StageError | Forbidden>
  /** Ends the run as failed with `reason` (its last attempt died, or the admin lost access), so the page stops waiting. */
  readonly fail: (message: VerifyMessage, reason: string) => Effect.Effect<boolean>
}>()("api/guards/VerifyRunner") {
  static readonly layer = Layer.effect(
    VerifyRunner,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const jobs = yield* VerifyJobs
      const principals = yield* VerifyPrincipals
      const audit = yield* AuditLog
      const resources = yield* ResourcesRepo
      const compiler = yield* GuardCompiler
      const { compileContext } = makeGuardDirectory({ resources, teams: yield* TeamsRepo, members: yield* MembersRepo, roles: yield* RolesRepo })
      const stages = {
        ...draftStages({ verifier: yield* GuardVerifier, compiler, compileContext }),
        ...testStages({ compiler, classifier: yield* Classifier, examples: yield* ExampleCalls, resources, children: yield* PinChildren, compileContext })
      }

      const step = Effect.fn("VerifyRunner.step")(function*(message: VerifyMessage, cached?: VerifyJob) {
        yield* Effect.annotateCurrentSpan({ "org.id": message.orgId, "guard.id": message.guardId, "guard.run": message.runId, "guard.stage": message.stage })
        const found = yield* guards.find(message.orgId, message.guardId)
        const run = Option.isNone(found) ? null : found.value.verify
        if (Option.isNone(found) || run === null || run.runId !== message.runId) return { _tag: "stale" } satisfies StepOutcome
        if (run.stage === "needs_confirmation") return { _tag: "paused" } satisfies StepOutcome
        if (!running(run.stage)) return { _tag: isTerminal(run.stage) ? "finished" : "stale" } satisfies StepOutcome
        const stage = run.stage
        const job = cached?.runId === run.runId ? cached : Option.getOrUndefined(yield* jobs.load(run.runId))
        if (job === undefined) return yield* new NotFound({ entity: "guard", id: `${message.guardId}/verify/${run.runId}` })
        // Caught up with a stage that already ran (its next message was lost or delayed): go on from where the run is.
        if (stage !== message.stage) return { _tag: "advanced", stage, job } satisfies StepOutcome

        const principal = yield* principals.resolve(message.orgId, job.requester)
        const output = yield* stages[stage]({ guard: found.value, run, job, principal, lastAttempt: message.attempt >= MaxStageAttempts }).pipe(
          Effect.timeoutOrElse({
            duration: StageTimeouts[stage],
            orElse: () => Effect.fail(new UpstreamFailure({ upstream: "guard-verify", message: `the ${stage} stage took longer than ${Duration.toSeconds(StageTimeouts[stage])} s` }))
          })
        )
        yield* jobs.save(output.job)
        const next = advance(run, output.next, yield* DateTime.now)
        const saved = yield* guards.saveForRun({ ...output.guard, verify: next }, atStage(run, stage), output.onlyDraft === true ? { onlyDraft: true } : {})
        if (!saved) {
          // A recompile refused because the rule was activated meanwhile: run the stage again, which then keeps the reviewed version.
          if (output.onlyDraft === true) return yield* new UpstreamFailure({ upstream: "guard-verify", message: "the rule changed while the recompile was saved" })
          return { _tag: "stale" } satisfies StepOutcome
        }
        yield* Effect.forEach(output.audit ?? [], (entry) =>
          audit.record({ orgId: message.orgId, type: entry.type, actor: actorOf(principal), target: { type: "guard", id: message.guardId }, data: entry.data }), { discard: true })
        if (output.next === "needs_confirmation") return { _tag: "paused" } satisfies StepOutcome
        return running(output.next) ? { _tag: "advanced", stage: output.next, job: output.job } satisfies StepOutcome : { _tag: "finished" } satisfies StepOutcome
      })

      const fail = Effect.fn("VerifyRunner.fail")(function*(message: VerifyMessage, reason: string) {
        const found = yield* guards.find(message.orgId, message.guardId)
        const run = Option.isNone(found) ? null : found.value.verify
        if (run === null || run.runId !== message.runId || isTerminal(run.stage)) return false
        return yield* guards.setRun(message.orgId, message.guardId, advance(run, "failed", yield* DateTime.now, reason), whileLive(run.runId))
      })

      return VerifyRunner.of({ step, fail })
    })
  )
}

/** A stage is tried this many times (its first try and two retries) before the run is marked failed. */
export const MaxStageAttempts = 3

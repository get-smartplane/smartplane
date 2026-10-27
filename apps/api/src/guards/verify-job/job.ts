import { AccessTokenId, GuardGrounding, GuardId, GuardPinLookup, GuardTestCallSource, GuardTestedCall, GuardToolCall, GuardVerifyStage, MembershipId, OrgId, ProjectId, UpstreamFailure, UserId } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { WorkerBindings } from "../../platform/bindings"
import { KvCache } from "../../platform/kv"
import { StoredToolDoc } from "../grounding/tool-doc"

/**
 * A `guard-self-tests` message: which run of which guard, the stage it expects to run, and how many times
 * that stage has been tried. Everything else is read from D1 (the run, the guard) and KV (the job).
 */
export const VerifyMessage = Schema.Struct({ orgId: OrgId, guardId: GuardId, runId: Schema.String, stage: GuardVerifyStage, attempt: Schema.Int })
export type VerifyMessage = typeof VerifyMessage.Type

/**
 * Who clicked Verify, by id only. Each stage re-resolves them from these ids and re-checks that they may
 * still manage rules, so a job never carries a token or a stale permission set.
 */
export const VerifyRequester = Schema.Struct({ userId: UserId, membershipId: MembershipId, tokenId: Schema.NullOr(AccessTokenId), projectId: Schema.NullOr(ProjectId) })
export type VerifyRequester = typeof VerifyRequester.Type

const SourcedCall = Schema.Struct({ call: GuardToolCall, source: GuardTestCallSource })

/**
 * What a run has worked out so far, stage by stage. Public tool schemas, the rule's own draft and made-up
 * example calls only: never credentials, never member data.
 */
export const VerifyJob = Schema.Struct({
  runId: Schema.String,
  orgId: OrgId,
  guardId: GuardId,
  requester: VerifyRequester,
  /** finding_targets: the ranked tools of the targets, which tools get example calls, notes on targets without a tool list. */
  found: Schema.optionalKey(Schema.Struct({
    tools: Schema.Array(StoredToolDoc),
    exampleTools: Schema.Array(Schema.String),
    notes: Schema.Array(Schema.String),
    grounding: GuardGrounding,
    pinning: Schema.optionalKey(GuardPinLookup)
  })),
  /** drafting: the draft's own example calls and what the review found wrong with it. */
  drafted: Schema.optionalKey(Schema.Struct({
    calls: Schema.Array(GuardToolCall),
    issues: Schema.Array(Schema.Struct({ code: Schema.String, detail: Schema.String }))
  })),
  /** testing: the calls every draft is tested on (people's and generated), and how the first draft did. */
  tested: Schema.optionalKey(Schema.Struct({
    base: Schema.Array(SourcedCall),
    calls: Schema.Array(GuardTestedCall),
    notes: Schema.Array(Schema.String)
  }))
})
export type VerifyJob = typeof VerifyJob.Type

/** A run can wait at `needs_confirmation` for an admin; past this its job is gone and it must start again. */
const JobTtlSeconds = 3 * 24 * 3600
const jobKey = (runId: string) => `guard-verify:v1:${runId}`
const encode = Schema.encodeEffect(Schema.toCodecJson(VerifyMessage))

export const newRunId = () => `vr_${Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("")}`

/**
 * The run's working state in KV and its messages on `guard-self-tests`. The queue keeps the name it had when it
 * ran only the self-test: renaming it means a new queue and dead-letter queue in every account for no gain.
 */
export class VerifyJobs extends Context.Service<VerifyJobs, {
  readonly save: (job: VerifyJob) => Effect.Effect<void>
  readonly load: (runId: string) => Effect.Effect<Option.Option<VerifyJob>>
  readonly enqueue: (message: VerifyMessage, delaySeconds?: number) => Effect.Effect<void, UpstreamFailure>
}>()("api/guards/VerifyJobs") {
  static readonly layer = Layer.effect(
    VerifyJobs,
    Effect.gen(function*() {
      const queue = (yield* WorkerBindings).GUARD_SELF_TESTS
      const kv = yield* KvCache
      return VerifyJobs.of({
        save: Effect.fn("VerifyJobs.save")((job: VerifyJob) => kv.set(jobKey(job.runId), VerifyJob, job, JobTtlSeconds)),
        load: (runId: string) => kv.get(jobKey(runId), VerifyJob),
        enqueue: Effect.fn("VerifyJobs.enqueue")(function*(message: VerifyMessage, delaySeconds?: number) {
          const body = yield* Effect.orDie(encode(message))
          yield* Effect.tryPromise({
            try: () => queue.send(body, { contentType: "json", ...(delaySeconds === undefined ? {} : { delaySeconds }) }),
            catch: () => new UpstreamFailure({ upstream: "guard-self-tests", message: "the verify run could not be queued" })
          })
        })
      })
    })
  )
}

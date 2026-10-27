import { type CompiledGuard, type GuardToolCall, type ModelTimedOut, UpstreamFailure } from "@pc/domain"
import { Clock, Context, Duration, Effect, Layer, Schema } from "effect"
import { WorkersAi } from "../platform/ai"
import { AppConfig, backgroundModel } from "../platform/config"
import { keepBroad } from "./compile/breadth"
import { emptyDirectory, type OrgDirectory } from "./compile/directory"
import { CompilerResponse, type CompilerDraft, draftCalls, draftOf, examplesOf, operationsOf } from "./compile/draft"
import type { FewShot } from "./compile/few-shot"
import { compilerMessages, draftJsonSchema, type PromptTools } from "./compile/prompt"
import { type DraftIssue, reviewDraft, type ToolCheck } from "./compile/review"
import { suggestionFor } from "./compile/suggest"
import { describeTool, type ToolDoc } from "./grounding/tool-doc"
import { compileCall, type ModelCall, runModel } from "./model-call"
import { unfenceModelOutput } from "./model-output"

export type { OrgDirectory } from "./compile/directory"

/** Real tools to ground the draft in, plus notes on named systems without a tool list, and feedback from a self-test. */
export interface CompileOptions {
  readonly tools?: ReadonlyArray<ToolDoc>
  readonly notes?: ReadonlyArray<string>
  /** Problems of an earlier draft found by running it (calls it misjudged), for one more attempt. */
  readonly feedback?: string
  /** Off the request path (the background self-test): each draft may take up to a minute, on the background model. */
  readonly patient?: boolean
  /** The rule names none of the systems whose tools are listed (they come from its scope): see `compile/breadth.ts`. */
  readonly unnamedSystem?: boolean
}

/** A compiled draft and its examples that are calls to listed tools, which the self-test runs. */
export interface CompiledDraft {
  readonly compiled: CompiledGuard
  readonly calls: ReadonlyArray<GuardToolCall>
}

/** A draft with what the deterministic review found wrong with it (issues worth a correction). */
export interface ReviewedDraft {
  readonly result: CompiledDraft
  readonly issues: ReadonlyArray<DraftIssue>
}

/** A reviewed draft as a background run keeps it between stages: only the issues' wording is needed to correct it. */
export interface CorrectableDraft {
  readonly result: CompiledDraft
  readonly issues: ReadonlyArray<{ readonly detail: string }>
}

/**
 * `compileDraft` keeps both drafts together inside this, well inside the 100 s edge limit for a caller on a request
 * (the evals run it so): the correction gets what is left of it (never more than one draft's own timeout) and is
 * skipped when too little is left to be worth starting. Verify's background job runs the two as separate stages.
 */
const CompileBudget = Duration.seconds(55)
const MinCorrection = Duration.seconds(10)
const PatientTimeout = Duration.seconds(60)

/** Issues worth a second attempt; a draft with fewer examples than asked is still usable. */
const retryable = (issues: ReadonlyArray<DraftIssue>) => issues.filter((issue) => issue.code !== "too_few_examples")

const referencedTools = (draft: CompilerDraft) => [...(draft.tools ?? []), ...draft.examples.flatMap((e) => (e.tool === undefined ? [] : [e.tool]))]

/**
 * Drafts Clef instructions from a plain-language rule, plus a suggested mode and approvers read from its
 * wording. Given the real tools of the systems the rule names, the question names those tools and the
 * argument shapes that match. A human reviews the draft before activation; nothing here activates.
 */
export class GuardCompiler extends Context.Service<GuardCompiler, {
  /** `directory` resolves approvers ("my", "the security team") to ids; without it they stay unresolved names. */
  readonly compile: (rule: string, orgContext: string, directory?: OrgDirectory, options?: CompileOptions) => Effect.Effect<CompiledGuard, UpstreamFailure | ModelTimedOut>
  /** At most two model calls: the draft, and one correction only when the deterministic review finds problems. */
  readonly compileDraft: (rule: string, orgContext: string, directory?: OrgDirectory, options?: CompileOptions) => Effect.Effect<CompiledDraft, UpstreamFailure | ModelTimedOut>
  /** One model call and the deterministic review of its answer: verify's `drafting` stage. */
  readonly firstDraft: (rule: string, orgContext: string, directory?: OrgDirectory, options?: CompileOptions) => Effect.Effect<ReviewedDraft, UpstreamFailure | ModelTimedOut>
  /**
   * At most one correction of `first` with its issues fed back, keeping whichever has fewer (the first on a
   * tie, or when the correction fails or runs past `timeout`): verify's `reviewing` stage.
   */
  readonly correct: (rule: string, orgContext: string, first: CorrectableDraft, directory?: OrgDirectory, options?: CompileOptions & { readonly timeout?: Duration.Duration }) => Effect.Effect<CompiledDraft>
}>()("api/guards/GuardCompiler") {
  /** Built from a model id (or full call settings) so the eval scripts run the same code against the REST API. */
  static readonly make = (model: string | ModelCall, shots?: ReadonlyArray<FewShot>, patientModel?: string) =>
    Effect.gen(function*() {
      const ai = yield* WorkersAi
      const call = typeof model === "string" ? compileCall(model) : model
      const unusable = () => new UpstreamFailure({ upstream: "guard-compiler", message: "the model did not return a usable draft" })

      const draft = (rule: string, orgContext: string, tools: PromptTools, correction: string | undefined, timeout: Duration.Duration, patient: boolean) =>
        runModel(ai, patient && patientModel !== undefined ? { ...compileCall(patientModel), timeout } : { ...call, timeout }, {
          messages: compilerMessages(rule, orgContext, correction, tools, shots),
          response_format: { type: "json_schema", json_schema: draftJsonSchema },
          temperature: 0.2,
          // Reasoning models spend part of this thinking; too few tokens and the JSON never arrives.
          max_tokens: 4096
        }).pipe(
          Effect.flatMap((raw) => Schema.decodeUnknownEffect(CompilerResponse)(unfenceModelOutput(raw)).pipe(Effect.mapError(unusable))),
          Effect.map(draftOf),
          Effect.catchTag("UpstreamFailure", (failure) => Effect.fail(failure.upstream === "guard-compiler" ? failure : unusable()))
        )

      const prepare = (rule: string, orgContext: string, directory: OrgDirectory, options: CompileOptions) => {
        const docs = options.tools ?? []
        const unnamed = options.unnamedSystem === true && docs.length > 0
        const prompt: PromptTools = { lines: docs.map(describeTool), notes: options.notes ?? [], unnamed }
        const byName = new Map(docs.map((doc) => [doc.gatewayName, doc.resourceId]))
        const listed = docs.map((doc) => doc.gatewayName)
        const finish = (from: CompilerDraft): ReviewedDraft => {
          const operations = operationsOf(from)
          // Only names of tools it was shown: an invented name could never match a call.
          const governing = [...new Set((from.tools ?? []).filter((name) => byName.has(name)))].slice(0, 50)
          const compiled: CompiledGuard = {
            instructions: unnamed ? keepBroad(from.instructions) : from.instructions,
            examples: examplesOf(from),
            ...(operations === undefined ? {} : { operations }),
            ...(governing.length === 0 ? {} : { tools: governing }),
            suggestion: suggestionFor(rule, from, directory)
          }
          const check: ToolCheck = { listed, referenced: referencedTools(from), ...(unnamed ? { unnamedProducts: docs.map((doc) => doc.product) } : {}) }
          const issues = retryable(reviewDraft(rule, compiled.suggestion?.mode ?? "enforce", compiled, orgContext, check))
          return { result: { compiled, calls: draftCalls(from, byName) }, issues }
        }
        const patient = options.patient === true
        return { docs, prompt, finish, patient, timeout: patient ? PatientTimeout : call.timeout }
      }

      const firstDraft = Effect.fn("GuardCompiler.firstDraft")(function*(rule: string, orgContext: string, directory: OrgDirectory = emptyDirectory, options: CompileOptions = {}) {
        const { docs, prompt, finish, patient, timeout } = prepare(rule, orgContext, directory, options)
        const first = finish(yield* draft(rule, orgContext, prompt, options.feedback, timeout, patient))
        yield* Effect.annotateCurrentSpan({ "compiler.model": call.model, "compiler.tools": docs.length, "compiler.issues": first.issues.map((i) => i.code).join(",") })
        return first
      })

      const correct = Effect.fn("GuardCompiler.correct")(function*(rule: string, orgContext: string, first: CorrectableDraft, directory: OrgDirectory = emptyDirectory, options: CompileOptions & { readonly timeout?: Duration.Duration } = {}) {
        if (first.issues.length === 0) return first.result
        const { prompt, finish, patient, timeout } = prepare(rule, orgContext, directory, options)
        // One corrective retry; keep whichever draft has fewer problems. A failed or late correction keeps the first.
        const correction = [options.feedback, ...first.issues.map((issue) => `- ${issue.detail}`)].filter((line) => line !== undefined).join("\n")
        const second = yield* draft(rule, orgContext, prompt, correction, options.timeout === undefined ? timeout : Duration.min(timeout, options.timeout), patient).pipe(Effect.map(finish), Effect.option)
        if (second._tag === "None") return first.result
        return second.value.issues.length < first.issues.length ? second.value.result : first.result
      })

      const compileDraft = Effect.fn("GuardCompiler.compile")(function*(rule: string, orgContext: string, directory: OrgDirectory = emptyDirectory, options: CompileOptions = {}) {
        const started = yield* Clock.currentTimeMillis
        const budget = options.patient === true ? Duration.times(PatientTimeout, 2) : CompileBudget
        const first = yield* firstDraft(rule, orgContext, directory, options)
        if (first.issues.length === 0) return first.result
        const left = Duration.millis(Duration.toMillis(budget) - ((yield* Clock.currentTimeMillis) - started))
        if (Duration.isLessThan(left, MinCorrection)) return first.result
        return yield* correct(rule, orgContext, first, directory, { ...options, timeout: left })
      })

      return GuardCompiler.of({
        compileDraft,
        firstDraft,
        correct,
        compile: (rule, orgContext, directory, options) => Effect.map(compileDraft(rule, orgContext, directory, options), (result) => result.compiled)
      })
    })

  static readonly layer = Layer.effect(
    GuardCompiler,
    Effect.gen(function*() {
      const config = yield* AppConfig
      return yield* GuardCompiler.make(config.COMPILER_MODEL, undefined, backgroundModel(config))
    })
  )
}

import { type CompiledGuard, type Guard, type GuardSelfTest, type GuardTestedCall, isMistake, mistakeRate, NotFound, type OrgId, selfTestSummary } from "@pc/domain"
import { DateTime, Effect } from "effect"
import type { ResourcesRepo } from "../../resources/resources-repo"
import { followSuggestion, withDerived } from "../applies/attach"
import type { Classifier } from "../classifier"
import { namesNoSystem } from "../compile/breadth"
import type { OrgDirectory } from "../compile/directory"
import type { GuardCompiler } from "../compiler"
import type { ExampleCalls } from "../examples/example-calls"
import type { PinChildren } from "../pinning/children-store"
import { feedbackFor } from "../self-test/run"
import { testDraft, testWorld } from "../self-test/world"
import type { StageAudit, StageError, StageInput, StageOutput } from "./stage"

interface Deps {
  readonly compiler: GuardCompiler["Service"]
  readonly classifier: Classifier["Service"]
  readonly examples: ExampleCalls["Service"]
  readonly resources: ResourcesRepo["Service"]
  readonly children: PinChildren["Service"]
  readonly compileContext: (orgId: OrgId) => Effect.Effect<{ readonly text: string; readonly directory: OrgDirectory }>
}

type Stage = (input: StageInput) => Effect.Effect<StageOutput, StageError>

/** The job or the draft it needs is gone (expired, or written by a stage this run never finished). */
const missing = (what: string) => new NotFound({ entity: "guard", id: `verify job: ${what}` })

const selfTestOf = (input: StageInput, fields: Pick<GuardSelfTest, "status" | "calls" | "retried"> & Partial<Pick<GuardSelfTest, "note" | "recompiled">>) =>
  Effect.map(DateTime.now, (now): GuardSelfTest => ({
    ...fields,
    threshold: input.guard.threshold,
    jobId: input.run.runId,
    startedAt: input.run.startedAt,
    ...(fields.status === "running" ? {} : { finishedAt: now })
  }))

const tested = (guard: Guard, runId: string, selfTest: GuardSelfTest, extra: Readonly<Record<string, unknown>> = {}): StageAudit => ({
  type: "guard.tested",
  data: { version: guard.compiledVersion, runId, status: selfTest.status ?? "done", selfTest: selfTestSummary(selfTest), retried: selfTest.retried, background: true, ...extra }
})

const joinNotes = (notes: ReadonlyArray<string | undefined>) => {
  const kept = notes.filter((note): note is string => note !== undefined && note !== "")
  return kept.length === 0 ? {} : { note: kept.join(" ").slice(0, 300) }
}

/** `testing` → (`retrying` or `done`) → `done`. Nothing here activates; a recompile is saved only to a draft. */
export const testStages = (deps: Deps): Readonly<Record<"testing" | "retrying", Stage>> => {
  const { compiler, classifier } = deps

  const testing: Stage = (input) =>
    Effect.gen(function*() {
      const { found, drafted } = input.job
      const compiled = input.guard.compiled
      if (found === undefined || drafted === undefined || compiled === null) return yield* missing("draft")
      const { world, base, generated, wanted } = yield* testWorld(input.guard, found, deps)
      const calls = yield* testDraft(classifier, world, base, { compiled, calls: drafted.calls })
      const notes = [
        wanted > 0 && generated === 0 ? "No example calls could be written for its tools; tested on the draft's own examples." : undefined,
        calls.length === 0 ? "Nothing to test it on: the rule names no system with listed tools and the draft has no tool-call examples." : undefined
      ]
      const mistakes = calls.filter(isMistake)
      const activated = mistakes.length > 0 && input.guard.status !== "draft"
      const finishes = mistakes.length === 0 || activated
      const selfTest = yield* selfTestOf(input, {
        status: finishes ? "done" : "running",
        calls,
        retried: false,
        ...joinNotes([...notes, activated ? "Not recompiled: the rule was activated while it was being tested." : undefined])
      })
      // The test's calls labelled as breaking the rule must all stay inside the suggested call filter.
      const { directory } = yield* deps.compileContext(input.guard.orgId)
      const derived = withDerived(compiled, { rule: input.guard.rule, tools: found.tools, calls, directory })
      const guard: Guard = { ...input.guard, compiled: { ...derived, selfTest } }
      const job = { ...input.job, tested: { base, calls, notes: notes.filter((note): note is string => note !== undefined) } }
      return { next: finishes ? "done" : "retrying", guard, job, ...(finishes ? { audit: [tested(guard, input.run.runId, selfTest)] } : {}) } satisfies StageOutput
    })

  const retrying: Stage = (input) =>
    Effect.gen(function*() {
      const { found, drafted, tested: first } = input.job
      const compiled = input.guard.compiled
      if (found === undefined || drafted === undefined || first === undefined || compiled === null) return yield* missing("test results")
      const keepFirst = (retried: boolean, note?: string) =>
        Effect.gen(function*() {
          const selfTest = yield* selfTestOf(input, { status: "done", calls: first.calls, retried, ...joinNotes([...first.notes, note]) })
          const guard: Guard = { ...input.guard, compiled: { ...compiled, selfTest } }
          return { next: "done", guard, job: input.job, audit: [tested(guard, input.run.runId, selfTest)] } satisfies StageOutput
        })
      // Someone activated the reviewed version meanwhile: it is never replaced behind their back.
      if (input.guard.status !== "draft") return yield* keepFirst(false, "Not recompiled: the rule was activated while it was being tested.")

      const context = yield* deps.compileContext(input.guard.orgId)
      const feedback = feedbackFor(first.calls.filter(isMistake))
      const attempt = Effect.gen(function*() {
        const second = yield* compiler.compileDraft(input.guard.rule, context.text, context.directory, { tools: found.tools, notes: found.notes, feedback, patient: true, unnamedSystem: namesNoSystem(found.grounding) })
        const { world } = yield* testWorld(input.guard, { ...found, exampleTools: [] }, deps)
        return { second, calls: yield* testDraft(classifier, world, first.base, second) }
      })
      // A transient failure is retried by the queue; on the last attempt the tested first draft stands.
      const result = input.lastAttempt ? yield* Effect.option(attempt) : yield* Effect.map(attempt, (value) => ({ _tag: "Some" as const, value }))
      if (result._tag === "None") return yield* keepFirst(true, "The recompile failed; the first draft is kept.")
      const { second, calls } = result.value
      if (calls.length === 0 || mistakeRate(calls) >= mistakeRate(first.calls)) return yield* keepFirst(true)

      const replaced: ReadonlyArray<GuardTestedCall> = first.calls
      const selfTest = yield* selfTestOf(input, {
        status: "done",
        calls,
        retried: true,
        recompiled: { fromVersion: input.guard.compiledVersion, previousInstructions: compiled.instructions, mistakes: replaced.filter(isMistake).length },
        ...joinNotes(first.notes)
      })
      const recompiled: CompiledGuard = {
        ...second.compiled,
        ...(compiled.grounding === undefined ? {} : { grounding: compiled.grounding }),
        ...(compiled.pinning === undefined ? {} : { pinning: compiled.pinning })
      }
      const derived = withDerived(recompiled, { rule: input.guard.rule, tools: found.tools, calls: [...first.calls, ...calls], directory: context.directory })
      const guard: Guard = followSuggestion({ ...input.guard, compiled: { ...derived, selfTest }, compiledVersion: input.guard.compiledVersion + 1 })
      const audit: ReadonlyArray<StageAudit> = [
        { type: "guard.compiled", data: { version: guard.compiledVersion, runId: input.run.runId, compiled: derived, background: true, recompiledFrom: input.guard.compiledVersion } },
        tested(guard, input.run.runId, selfTest)
      ]
      return { next: "done", guard, job: { ...input.job, drafted: { ...drafted, calls: second.calls } }, audit, onlyDraft: true } satisfies StageOutput
    })

  return { testing, retrying }
}

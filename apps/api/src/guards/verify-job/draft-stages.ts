import { type CompiledGuard, type Guard, type GuardPin, type GuardToolCall, NotFound, type OrgId } from "@pc/domain"
import { Effect } from "effect"
import { followSuggestion, withDerived } from "../applies/attach"
import { namesNoSystem } from "../compile/breadth"
import type { OrgDirectory } from "../compile/directory"
import type { GuardCompiler } from "../compiler"
import { type StoredToolDoc, storedToolDoc } from "../grounding/tool-doc"
import type { GuardVerifier } from "../verify"
import type { StageError, StageInput, StageOutput } from "./stage"

interface Deps {
  readonly verifier: GuardVerifier["Service"]
  readonly compiler: GuardCompiler["Service"]
  readonly compileContext: (orgId: OrgId) => Effect.Effect<{ readonly text: string; readonly directory: OrgDirectory }>
}

type Stage = (input: StageInput) => Effect.Effect<StageOutput, StageError>

/** The job or the draft it needs is gone (expired, or written by a stage this run never finished). */
const missing = (what: string) => new NotFound({ entity: "guard", id: `verify job: ${what}` })

/** Re-checked pins keep any confirmed or removed meanwhile: only `missing` and `checkedAt` come from the check. */
const mergeChecks = (current: ReadonlyArray<GuardPin>, checked: ReadonlyArray<GuardPin>): ReadonlyArray<GuardPin> =>
  current.map((pin) => {
    const check = checked.find((candidate) => candidate.id === pin.id)
    return check?.checkedAt === undefined ? pin : { ...pin, missing: check.missing === true, checkedAt: check.checkedAt }
  })

/** The draft with what the first stage found attached, as the page shows it. */
const withFindings = (compiled: CompiledGuard, input: StageInput): CompiledGuard => {
  const found = input.job.found
  return { ...compiled, ...(found === undefined ? {} : { grounding: found.grounding }), ...(found?.pinning === undefined ? {} : { pinning: found.pinning }) }
}

/** What the call filter is derived from: the run's tools and every labelled call known for the draft. */
const deriveContext = (input: StageInput, tools: ReadonlyArray<StoredToolDoc>, calls: ReadonlyArray<GuardToolCall>, directory: OrgDirectory) =>
  ({ rule: input.guard.rule, tools, calls: [...input.guard.testCalls, ...calls], directory })

/** The pin lookup found candidates nobody has decided on: the run waits for an admin before testing. */
const awaitsConfirmation = (guard: Guard) =>
  guard.pins.length === 0 && guard.compiled?.pinning?.status === "found" && guard.compiled.pinning.candidates.length > 0

/** `queued` → `finding_targets` → `drafting` → `reviewing` → (`needs_confirmation` or `testing`). */
export const draftStages = ({ verifier, compiler, compileContext }: Deps): Readonly<Record<"queued" | "finding_targets" | "drafting" | "reviewing", Stage>> => ({
  queued: (input) => Effect.succeed({ next: "finding_targets", guard: input.guard, job: input.job }),

  finding_targets: (input) =>
    Effect.gen(function*() {
      const found = yield* verifier.findTargets(input.principal, input.guard)
      const job = {
        ...input.job,
        found: {
          tools: found.tools.map(storedToolDoc),
          exampleTools: found.exampleTools,
          notes: found.notes,
          grounding: found.grounding,
          ...(found.pinning === undefined ? {} : { pinning: found.pinning })
        }
      }
      return { next: "drafting", guard: { ...input.guard, pins: mergeChecks(input.guard.pins, found.pins) }, job } satisfies StageOutput
    }),

  drafting: (input) =>
    Effect.gen(function*() {
      const found = input.job.found
      if (found === undefined) return yield* missing("targets")
      const context = yield* compileContext(input.guard.orgId)
      const first = yield* compiler.firstDraft(input.guard.rule, context.text, context.directory, { tools: found.tools, notes: found.notes, unnamedSystem: namesNoSystem(found.grounding) })
      // A new draft always returns the rule to draft: a person reviews it before it enforces anything.
      const compiled = withDerived(withFindings(first.result.compiled, input), deriveContext(input, found.tools, first.result.calls, context.directory))
      const guard: Guard = followSuggestion({ ...input.guard, compiled, compiledVersion: input.guard.compiledVersion + 1, status: "draft" })
      const job = { ...input.job, drafted: { calls: first.result.calls, issues: first.issues.map(({ code, detail }) => ({ code, detail })) } }
      return { next: "reviewing", guard, job } satisfies StageOutput
    }),

  reviewing: (input) =>
    Effect.gen(function*() {
      const { found, drafted } = input.job
      const compiled = input.guard.compiled
      if (found === undefined || drafted === undefined || compiled === null) return yield* missing("draft")
      const context = yield* compileContext(input.guard.orgId)
      const kept = yield* compiler.correct(input.guard.rule, context.text, { result: { compiled, calls: drafted.calls }, issues: drafted.issues }, context.directory, { tools: found.tools, notes: found.notes, unnamedSystem: namesNoSystem(found.grounding) })
      const reviewed: CompiledGuard = withDerived(kept.compiled === compiled ? compiled : withFindings(kept.compiled, input), deriveContext(input, found.tools, kept.calls, context.directory))
      const guard: Guard = followSuggestion({ ...input.guard, compiled: reviewed })
      const missingPins = guard.pins.filter((pin) => pin.missing === true).map((pin) => pin.id)
      const audit = [{
        type: "guard.compiled" as const,
        data: { version: guard.compiledVersion, runId: input.run.runId, compiled: reviewed, corrected: kept.compiled !== compiled, ...(missingPins.length === 0 ? {} : { pinsMissing: missingPins }) }
      }]
      return { next: awaitsConfirmation(guard) ? "needs_confirmation" : "testing", guard, job: { ...input.job, drafted: { ...drafted, calls: kept.calls } }, audit } satisfies StageOutput
    })
})

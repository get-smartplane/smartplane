import { GuardId, type GuardOperation, type GuardTestCallSource, type GuardTestedCall, type GuardToolCall, isMistake, mistakeRate, type Resource } from "@pc/domain"
import { Effect } from "effect"
import type { Classifier } from "../classifier"
import { classifierState } from "../classifier-state"
import type { CompiledDraft } from "../compiler"
import { questionFor } from "../evaluation"
import { compactJson } from "../grounding/compact"
import type { ToolDoc } from "../grounding/tool-doc"
import { noPins, pinnedContext, pinnedLine, type PinView } from "../pinning/context"
import { CreateInPinProbability, createsInPin } from "../pinning/create-in-pin"
import { type ScannedPin, touchedPins } from "../pinning/scan"

export interface SourcedCall {
  readonly call: GuardToolCall
  readonly source: GuardTestCallSource
}

/** What the self-test needs to build each call's classifier state the way the gateway would. */
export interface SelfTestWorld {
  readonly resources: ReadonlyMap<string, Resource>
  readonly tools: ReadonlyMap<string, ToolDoc>
  readonly threshold: number
  /** The rule's confirmed pins with the items known inside them, so pinned calls are judged as the gateway judges them. */
  readonly pins?: ReadonlyArray<ScannedPin>
  readonly operations?: ReadonlyArray<GuardOperation> | undefined
}

const SelfTestGuard = GuardId.make("grd_selftest")

/** A neutral caller: rules without an actor condition must not depend on who calls. */
const testActor = { type: "User", email: "agent-test@smartplane.invalid", role: "member", teams: [], teamNames: [], project: null }

const unique = (calls: ReadonlyArray<SourcedCall>) => {
  const seen = new Set<string>()
  return calls.filter(({ call }) => {
    const key = `${call.tool} ${JSON.stringify(call.arguments)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Runs each call through the real call-time classifier (Clef) with the guard's question, exactly as the
 * gateway would build its state, and records expected against actual. Calls whose resource is unknown are
 * skipped. Fails only when the classifier does.
 */
export const runSelfTest = (classifier: Classifier["Service"], question: string, calls: ReadonlyArray<SourcedCall>, world: SelfTestWorld) =>
  Effect.forEach(unique(calls).slice(0, 30), ({ call, source }) => {
    const doc = world.tools.get(call.tool)
    const resource = world.resources.get(call.resourceId ?? doc?.resourceId ?? "")
    if (resource === undefined) return Effect.succeed([])
    const tool = doc?.name ?? call.tool.split("__").at(-1) ?? call.tool
    // Only the positive pin line: test calls carry made-up ids, so "no id matches the pin" would be false here.
    const touches = touchedPins(call.arguments, world.pins ?? [])
    const view: PinView = { ...noPins, touches: new Map([[SelfTestGuard, touches]]) }
    const certain = createsInPin({ tool, access: doc?.access, arguments: call.arguments, operations: world.operations }, world.pins ?? []) !== undefined
    const state = classifierState({
      actor: testActor,
      resource,
      tool,
      toolInfo: { gatewayName: call.tool, title: doc?.title, description: doc === undefined ? undefined : `[${resource.name}] ${doc.description}` },
      arguments: call.arguments,
      connection: null,
      ...(touches.length === 0 ? {} : { pinned: pinnedContext(view) })
    })
    const asked = touches.length === 0 ? question : `${question}\n\n${pinnedLine(touches)}`
    return classifier.classify(state, new Map([["guard", asked]])).pipe(
      Effect.map((scores): ReadonlyArray<GuardTestedCall> => {
        const probability = certain ? CreateInPinProbability : scores.get("guard") ?? 0
        return [{ ...call, source, probability, triggered: probability >= world.threshold }]
      })
    )
  }, { concurrency: 6 }).pipe(Effect.map((tested) => tested.flat()), Effect.withSpan("GuardSelfTest.run"))

export const feedbackFor = (mistakes: ReadonlyArray<GuardTestedCall>) =>
  [
    "Running the draft question through the classifier misjudged these calls:",
    ...mistakes.slice(0, 8).map((call) =>
      `- ${call.tool} ${compactJson(call.arguments, 200)}${call.note ? ` (${call.note})` : ""}: ${call.violates ? "breaks the rule but was allowed" : "does not break the rule but was flagged"}`
    ),
    "Rewrite the question so these calls are judged correctly: name the tools and the argument shapes that decide it.",
    "Their ids, URLs and titles are made up for the test: never copy them into the question."
  ].join("\n")

export interface TestedDraft {
  readonly draft: CompiledDraft
  readonly calls: ReadonlyArray<GuardTestedCall>
  readonly retried: boolean
}

export interface Retested<E> {
  readonly draft: CompiledDraft
  readonly calls?: ReadonlyArray<GuardTestedCall>
  readonly retried: boolean
  /** The first draft's results, when a recompile replaced it. */
  readonly replaced?: ReadonlyArray<GuardTestedCall>
  readonly redraftError?: E
}

/**
 * Tests a draft on the base calls plus its own examples and, when it misjudges any, drafts once more with
 * the mistakes fed back, keeping whichever misjudges fewer (the first on a tie). Never activates.
 * `test` returning `undefined` means the classifier could not run: the draft is kept untested.
 */
export const testAndRecompile = <E>(
  first: CompiledDraft,
  redraft: (feedback: string) => Effect.Effect<CompiledDraft, E>,
  test: (draft: CompiledDraft) => Effect.Effect<ReadonlyArray<GuardTestedCall> | undefined>
): Effect.Effect<Retested<E>> =>
  Effect.gen(function*() {
    const firstCalls = yield* test(first)
    if (firstCalls === undefined) return { draft: first, retried: false }
    const mistakes = firstCalls.filter(isMistake)
    if (mistakes.length === 0) return { draft: first, calls: firstCalls, retried: false }
    const second = yield* Effect.result(redraft(feedbackFor(mistakes)))
    if (second._tag === "Failure") return { draft: first, calls: firstCalls, retried: true, redraftError: second.failure }
    const secondCalls = yield* test(second.success)
    if (secondCalls === undefined || mistakeRate(secondCalls) >= mistakeRate(firstCalls)) return { draft: first, calls: firstCalls, retried: true }
    return { draft: second.success, calls: secondCalls, retried: true, replaced: firstCalls }
  })

/** Drafts, then `testAndRecompile`: the eval's one-shot form of what verify and its background job do. */
export const draftTestAndRetry = <E>(
  draft: (feedback?: string) => Effect.Effect<CompiledDraft, E>,
  test: (draft: CompiledDraft) => Effect.Effect<ReadonlyArray<GuardTestedCall> | undefined>
): Effect.Effect<Retested<E>, E> => Effect.flatMap(draft(), (first) => testAndRecompile(first, draft, test))

/** The question a draft would be asked with, for running it before it is saved. */
export const draftQuestion = (draft: CompiledDraft) => questionFor(draft.compiled)

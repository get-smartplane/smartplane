import type { CompiledGuard, GuardApplies, GuardOperation, GuardStarterId, ResourceId } from "@pc/domain"
import type { Schema } from "effect"
import { readIntent } from "../compile/intent"
import { compactJson } from "../grounding/compact"

/** A tool call as the onboarding test sends it: the tool's name and its arguments. */
export interface StarterCall {
  readonly tool: string
  readonly arguments: Schema.Json
  /** What the call does, in a few words. */
  readonly note: string
}

/**
 * A rule Smartplane prepared by hand: the wording onboarding suggests, the classifier question it compiles to,
 * and calls that check it. Broad on purpose: a prepared rule never depends on a tool's name, only on what the
 * call does. `scripts/eval-starters.ts` runs `sample` and `benign` through Clef; the recorded scores are tested.
 */
export interface Starter {
  readonly id: GuardStarterId
  readonly rule: string
  readonly instructions: string
  /** The labelled calls the question carries, distinct from the held-out `sample` and `benign` calls. */
  readonly examples: ReadonlyArray<StarterCall & { readonly violates: boolean }>
  readonly operations: ReadonlyArray<GuardOperation>
  /** The rule governs no reads: tools marked read-only need not reach the classifier. */
  readonly changesOnly: boolean
  /** A call that breaks the rule: onboarding's "Try it on a call" starts from it. */
  readonly sample: StarterCall
  /** Calls close to the rule that do not break it. */
  readonly benign: ReadonlyArray<StarterCall>
}

export const call = (tool: string, args: Schema.Json, note: string): StarterCall => ({ tool, arguments: args, note })
export const breaks = (tool: string, args: Schema.Json, note: string) => ({ ...call(tool, args, note), violates: true })
export const allowed = (tool: string, args: Schema.Json, note: string) => ({ ...call(tool, args, note), violates: false })

/** The hand-written check, in the shape a verify run would have saved, marked as the starter's. */
export const compiledOf = (starter: Starter): CompiledGuard => ({
  instructions: starter.instructions,
  examples: starter.examples.map((example) => ({ action: `${example.tool} ${compactJson(example.arguments, 220)} (${example.note})`, violates: example.violates })),
  operations: starter.operations,
  suggestion: { mode: "enforce", approvers: [], unresolved: [], cue: readIntent(starter.rule).cue },
  // No starter names a person or an account: the classifier never needs the caller's email or account identity.
  references: { people: false, accounts: [] },
  starter: starter.id
})

/** Its call filter within the guard's scope: every call, or only those that may change something. */
export const appliesOf = (starter: Starter, resourceIds: ReadonlyArray<ResourceId>): GuardApplies => ({
  resourceIds,
  ...(starter.changesOnly ? { operations: "changes" as const } : {})
})

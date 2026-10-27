import type { CompiledGuard, Guard, GuardToolCall } from "@pc/domain"
import type { OrgDirectory } from "../compile/directory"
import type { StoredToolDoc } from "../grounding/tool-doc"
import { deriveApplies } from "./derive"
import { readReferences } from "./references"

export interface DeriveContext {
  readonly rule: string
  readonly tools: ReadonlyArray<StoredToolDoc>
  /** Every call known so far, labelled; the ones that break the rule must stay inside the filter. */
  readonly calls: ReadonlyArray<GuardToolCall>
  readonly directory: OrgDirectory
}

/**
 * The draft with its suggested call filter and identity references (re)read: each verify stage that changes
 * the draft or learns of more violating calls calls this, so the suggestion always covers every call known
 * to break the rule. Nothing here is accepted: `Guard.applies` changes only when an admin accepts it.
 */
export const withDerived = (compiled: CompiledGuard, context: DeriveContext): CompiledGuard => {
  const { applies: _previous, references: _read, ...rest } = compiled
  const applies = deriveApplies({ rule: context.rule, compiled: rest, tools: context.tools, violating: context.calls.filter((call) => call.violates), directory: context.directory })
  const references = readReferences(context.rule, context.directory, { suggestion: compiled.suggestion, actors: applies?.actors })
  return { ...rest, ...(applies === undefined ? {} : { applies }), references }
}

/**
 * A rule added without a mode takes the mode its wording suggests, and the approvers when it asks for
 * approval. Only on the draft a stage saves; the repository applies it only while the stored rule still
 * follows its wording and is a draft. Never activates anything.
 */
export const followSuggestion = (guard: Guard): Guard => {
  const suggestion = guard.compiled?.suggestion
  if (!guard.modeFollowsRule || suggestion === undefined) return guard
  return { ...guard, mode: suggestion.mode, approvers: suggestion.mode === "require_approval" ? suggestion.approvers : [] }
}

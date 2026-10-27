import { type GuardApprover, type GuardSuggestion, uniqueApprovers } from "@pc/domain"
import { type OrgDirectory, resolveApprover } from "./directory"
import type { CompilerDraft } from "./draft"
import { readIntent } from "./intent"

const resolveAll = (references: ReadonlyArray<string>, directory: OrgDirectory) => {
  const approvers: Array<GuardApprover> = []
  const unresolved: Array<string> = []
  for (const reference of references) {
    const resolved = resolveApprover(reference, directory)
    if (typeof resolved === "string") unresolved.push(resolved)
    else approvers.push(resolved)
  }
  return { approvers, unresolved }
}

/**
 * Combines the rule's wording with the model's reading. A recognised approval or monitor cue in the wording
 * wins: it is deterministic and testable. Otherwise the model decides, since "never merge unless security
 * reviewed it" reads as enforce by its words but asks for approval. Approvers come from the wording when
 * it has an approval cue, else from the model; an approval with nobody named goes to the author.
 */
export const suggestionFor = (rule: string, draft: CompilerDraft | undefined, directory: OrgDirectory): GuardSuggestion => {
  const wording = readIntent(rule)
  const model = draft?.intent
  const wordingDecides = wording.mode !== "enforce" || model === undefined
  const mode = wordingDecides ? wording.mode : model.mode
  if (mode !== "require_approval") return { mode, approvers: [], unresolved: [], cue: wordingDecides ? wording.cue : model.cue ?? wording.cue }

  const references = wording.mode === "require_approval"
    ? (wording.approverPhrases.length === 0 ? ["my"] : wording.approverPhrases)
    : (model?.approvers ?? []).map((ref) => (ref.kind === "author" ? "my" : ref.ref ?? "my"))
  const { approvers, unresolved } = resolveAll(references, directory)
  return {
    mode,
    approvers: uniqueApprovers(approvers.length === 0 && unresolved.length === 0 ? [{ _tag: "Author" }] : approvers),
    unresolved,
    cue: wording.mode === "require_approval" ? wording.cue : model?.cue ?? null
  }
}

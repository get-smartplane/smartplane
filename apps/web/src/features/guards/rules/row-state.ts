import { type Guard, type GuardVerifyRun, verifyActive } from "@pc/domain"
import { pollingFor } from "../verify/verify-state"

/** Why a rule in the list needs a person before it can go on. */
export type AttentionReason = "confirm" | "failed" | "stale" | "suggestion"

/**
 * What a rule's row shows in its status cell. `verifying`: the run's live stage. `attention`: something to
 * decide or fix (marked, and the row opens the rule). `review`: verified and waiting to be read and switched
 * on, never switched on by itself. `status`: the plain status badge.
 */
export type RowState =
  | { readonly kind: "verifying"; readonly run: GuardVerifyRun }
  | { readonly kind: "attention"; readonly reason: AttentionReason; readonly label: string }
  | { readonly kind: "review" }
  | { readonly kind: "status" }

const attention = (reason: AttentionReason, label: string): RowState => ({ kind: "attention", reason, label })

/** The rule's wording asks for something the rule does not do yet, or names an approver nobody matched. */
const suggestionOpen = (guard: Guard): boolean => {
  const suggestion = guard.compiled?.suggestion
  if (suggestion === undefined) return false
  return suggestion.unresolved.length > 0 || suggestion.mode !== guard.mode
}

export const rowState = (guard: Guard, now: number): RowState => {
  const run = guard.verify
  if (run !== null && verifyActive(run)) {
    if (run.stage === "needs_confirmation") return attention("confirm", "Confirm what it names")
    if (pollingFor(guard, now) === "stale") return attention("stale", "Verify is stuck")
    return { kind: "verifying", run }
  }
  if (guard.status !== "draft") return { kind: "status" }
  if (run?.stage === "failed") return attention("failed", "Verify failed")
  if (guard.compiled === null) return { kind: "status" }
  if (suggestionOpen(guard)) return attention("suggestion", "Review the suggestion")
  return { kind: "review" }
}

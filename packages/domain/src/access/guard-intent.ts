import { Schema } from "effect"
import { RoleSlug, TeamId, UserId } from "../ids"

export const GuardMode = Schema.Literals(["enforce", "monitor", "require_approval"])
export type GuardMode = typeof GuardMode.Type

/**
 * Who may release an action held by a `require_approval` guard. `Author` is whoever wrote the rule, so
 * "without my permission" keeps meaning the same person if the rule is later edited by someone else.
 */
export const GuardApprover = Schema.TaggedUnion({
  Author: {},
  Role: { role: RoleSlug },
  Team: { teamId: TeamId },
  User: { userId: UserId }
}).annotate({ identifier: "GuardApprover" })
export type GuardApprover = typeof GuardApprover.Type

/**
 * What the compiler read from the rule's wording ("without my permission" → approval by the author,
 * "alert me" → monitor). Only a suggestion: a person applies it before activating; nothing switches itself on.
 */
export const GuardSuggestion = Schema.Struct({
  mode: GuardMode,
  approvers: Schema.Array(GuardApprover),
  /** Approver references in the rule that matched no role, team or member; the reviewer picks them by hand. */
  unresolved: Schema.Array(Schema.String),
  /** The words in the rule that decided the mode, e.g. "without my permission"; null when nothing did. */
  cue: Schema.NullOr(Schema.String)
}).annotate({ identifier: "GuardSuggestion" })
export type GuardSuggestion = typeof GuardSuggestion.Type

const approverKey = (approver: GuardApprover): string =>
  approver._tag === "Author" ? "author" : approver._tag === "Role" ? `role:${approver.role}` : approver._tag === "Team" ? `team:${approver.teamId}` : `user:${approver.userId}`

/** Same approvers, ignoring order and duplicates. */
export const sameApprovers = (a: ReadonlyArray<GuardApprover>, b: ReadonlyArray<GuardApprover>): boolean => {
  const left = new Set(a.map(approverKey))
  const right = new Set(b.map(approverKey))
  return left.size === right.size && [...left].every((key) => right.has(key))
}

/** Drops duplicates, keeping first occurrences. */
export const uniqueApprovers = (approvers: ReadonlyArray<GuardApprover>): ReadonlyArray<GuardApprover> => {
  const seen = new Set<string>()
  return approvers.filter((approver) => {
    const key = approverKey(approver)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

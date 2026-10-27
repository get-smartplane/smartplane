import type { CompiledGuard, DenyReason, Guard, GuardId, Resource } from "@pc/domain"

/** Guards that must be checked for an action on `resource`. */
export const applicableGuards = (guards: ReadonlyArray<Guard>, resource: Resource): ReadonlyArray<Guard> =>
  guards.filter((guard) =>
    guard.status === "active" && guard.compiled !== null && guard.orgId === resource.orgId &&
    (guard.projectId === null || guard.projectId === resource.projectId) &&
    (guard.resourceIds.length === 0 || guard.resourceIds.includes(resource.id))
  )

/** The Clef question for a guard: the reviewed instructions plus their labelled examples. */
export const questionFor = (compiled: CompiledGuard): string =>
  compiled.examples.length === 0
    ? compiled.instructions
    : `${compiled.instructions}\n\nExamples:\n${
      compiled.examples.map((example) => `- ${example.violates ? "VIOLATES" : "OK"}: ${example.action}`).join("\n")
    }`

/** Violation probabilities by guard id, or `undefined` when the classifier could not be reached. */
export type Scores = ReadonlyMap<string, number> | undefined

export type GuardVerdict =
  | { readonly _tag: "Allow"; readonly flaggedBy: ReadonlyArray<GuardId> }
  | { readonly _tag: "Deny"; readonly reasons: readonly [DenyReason, ...Array<DenyReason>] }
  | { readonly _tag: "NeedsApproval"; readonly guardId: GuardId; readonly flaggedBy: ReadonlyArray<GuardId> }

/**
 * Combines guard answers into a verdict. Fails closed: an enforcing or approval guard without an answer
 * denies with `GuardUnavailable`. Monitor guards never block; when triggered they are only flagged.
 * Enforced denials win over approvals, so an approver can never release an action a guard forbids.
 */
export const decide = (guards: ReadonlyArray<Guard>, scores: Scores): GuardVerdict => {
  const denials: Array<DenyReason> = []
  const approvals: Array<GuardId> = []
  const flagged: Array<GuardId> = []
  for (const guard of guards) {
    const probability = scores?.get(guard.id)
    if (probability === undefined) {
      if (guard.mode !== "monitor") denials.push({ _tag: "GuardUnavailable", guardId: guard.id })
      continue
    }
    if (probability < guard.threshold) continue
    if (guard.mode === "enforce") denials.push({ _tag: "GuardViolation", guardId: guard.id, probability })
    else if (guard.mode === "require_approval") approvals.push(guard.id)
    else flagged.push(guard.id)
  }
  const [firstDenial, ...moreDenials] = denials
  if (firstDenial !== undefined) return { _tag: "Deny", reasons: [firstDenial, ...moreDenials] }
  const [approvalGuard] = approvals
  if (approvalGuard !== undefined) return { _tag: "NeedsApproval", guardId: approvalGuard, flaggedBy: flagged }
  return { _tag: "Allow", flaggedBy: flagged }
}

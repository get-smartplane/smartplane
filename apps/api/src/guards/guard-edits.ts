import { type CreateGuard, type Guard, nameFromRule, type UpdateGuard } from "@pc/domain"

/**
 * The name a new guard starts with. No name, or the name derived from the rule (what older dashboards and
 * CLIs always sent), means the name follows the rule; anything else was typed by a person and sticks.
 */
export const initialName = (input: CreateGuard): Pick<Guard, "name" | "nameFollowsRule"> =>
  input.name === undefined || input.name === nameFromRule(input.rule)
    ? { name: nameFromRule(input.rule), nameFollowsRule: true }
    : { name: input.name, nameFollowsRule: false }

/** A rule added without a mode starts as `enforce`, and verify sets what its wording suggests (see `modeFollowsRule`). */
export const initialMode = (input: CreateGuard): Pick<Guard, "mode" | "modeFollowsRule"> =>
  input.mode === undefined ? { mode: "enforce", modeFollowsRule: true } : { mode: input.mode, modeFollowsRule: false }

/**
 * Applies an edit. A new rule text invalidates the compiled prompt, which describes the old rule: the
 * guard drops it and returns to draft, so nothing enforces a question nobody reviewed for this text.
 * Its pins and accepted call filter go too. The name follows the new text unless someone named the guard by
 * hand; choosing a mode or approvers by hand stops verify from setting them.
 */
export const applyEdits = (guard: Guard, input: UpdateGuard): Guard => {
  const rule = input.rule ?? guard.rule
  const ruleChanged = rule !== guard.rule
  const naming = input.name !== undefined
    ? { name: input.name, nameFollowsRule: input.name === nameFromRule(rule) }
    : { name: guard.nameFollowsRule ? nameFromRule(rule) : guard.name, nameFollowsRule: guard.nameFollowsRule }
  return {
    ...guard,
    ...naming,
    rule,
    mode: input.mode ?? guard.mode,
    modeFollowsRule: guard.modeFollowsRule && input.mode === undefined && input.approvers === undefined,
    threshold: input.threshold ?? guard.threshold,
    approvers: input.approvers ?? guard.approvers,
    resourceIds: input.resourceIds ?? guard.resourceIds,
    status: ruleChanged ? "draft" : input.status ?? guard.status,
    compiled: ruleChanged ? null : guard.compiled,
    // A pin was confirmed for what the old wording named; the next verify looks it up again.
    pins: ruleChanged ? [] : guard.pins,
    // The filter was derived from the old wording; until the new one is verified and accepted, every call in scope is checked.
    applies: ruleChanged ? null : input.applies === undefined ? guard.applies : input.applies
  }
}

import { type Action, actionImplies, type IntegrationAction } from "@pc/domain"
import type { GrantDraft } from "./grant-draft"

/**
 * The granted actions that change things but stay out of reach below `write`. `chosen` is the allow-list,
 * or null for every action.
 */
export const writesBelowLevel = (
  action: Action,
  actions: ReadonlyArray<IntegrationAction>,
  chosen: ReadonlyArray<string> | null
): ReadonlyArray<IntegrationAction> =>
  actionImplies(action, "write")
    ? []
    : actions.filter((candidate) => candidate.requiredAction === "write" && (chosen === null || chosen.includes(candidate.name)))

/** Drops `names` from the allow-list, and the argument limits that would now name an unlisted tool. */
export const withoutTools = (draft: GrantDraft, names: ReadonlyArray<string>): Pick<GrantDraft, "tools" | "argumentLimits"> => ({
  tools: draft.tools.filter((tool) => !names.includes(tool)),
  argumentLimits: draft.argumentLimits.filter((limit) => !names.includes(limit.tool))
})

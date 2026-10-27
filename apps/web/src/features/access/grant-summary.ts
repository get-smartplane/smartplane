import { isBlank } from "./argument-limits/argument-limits"
import type { GrantDraft } from "./grant-draft"
import type { ToolSource } from "./tool-source"
import { writesBelowLevel } from "./write-level"

/** The advanced defaults in a few words, so nobody has to open the section to know what they grant. */
export const grantSummary = (draft: GrantDraft, source: ToolSource | undefined): string => {
  const limits = draft.argumentLimits.filter((limit) => !isBlank(limit)).length
  const noun = source?.kind === "integration" ? "actions" : "tools"
  const blocked = source?.kind === "integration" && draft.restrictTools ? writesBelowLevel(draft.action, source.actions, draft.tools).length : 0
  return [
    draft.expiry === "" ? "Never expires" : `Expires ${draft.expiry}`,
    source && source.kind !== "tool" ? (draft.restrictTools ? `${draft.tools.length} ${noun}` : `All ${noun}`) : null,
    blocked > 0 ? `${blocked} need Write` : null,
    source ? (limits === 0 ? "any arguments" : `${limits} argument ${limits === 1 ? "limit" : "limits"}`) : null
  ]
    .filter((part) => part !== null)
    .join(" · ")
}

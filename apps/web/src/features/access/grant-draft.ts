import type { Action, SubjectType } from "@pc/domain"
import { DateTime, Option } from "effect"
import { toArgumentInput, type ArgumentLimitDraft, type ValueTypeOf } from "./argument-limits/argument-limits"

export interface GrantDraft {
  readonly subjectType: SubjectType
  readonly subjectId: string
  readonly resourceId: string
  readonly action: Action
  readonly restrictTools: boolean
  readonly tools: ReadonlyArray<string>
  readonly argumentLimits: ReadonlyArray<ArgumentLimitDraft>
  /** `yyyy-mm-dd` from a date input; empty means the grant never expires. */
  readonly expiry: string
}

export const emptyGrantDraft: GrantDraft = {
  subjectType: "team",
  subjectId: "",
  resourceId: "",
  action: "use",
  restrictTools: false,
  tools: [],
  argumentLimits: [],
  expiry: ""
}

/**
 * Starts from the signed-in person's own team, the most common subject, when they have one; a resource page
 * passes its resource so only "who" is left to choose.
 */
export const initialGrantDraft = (teamIds: ReadonlyArray<string>, resourceId = ""): GrantDraft => ({ ...emptyGrantDraft, subjectId: teamIds[0] ?? "", resourceId })

/** Tools and limits belong to one resource; choosing another starts them over. */
export const withResource = (draft: GrantDraft, resourceId: string): GrantDraft => ({ ...draft, resourceId, restrictTools: false, tools: [], argumentLimits: [] })

/** Expires at the end of the chosen day, UTC. An unparseable date is passed through for the schema to reject. */
const expiryInput = (date: string) => Option.getOrElse(DateTime.make(`${date}T23:59:59Z`), () => date)

/** The candidate `CreateGrant`; the domain schema validates ids, tools, argument limits and expiry. */
export const toGrantInput = (draft: GrantDraft, valueTypeOf: ValueTypeOf) => ({
  subject:
    draft.subjectType === "role"
      ? { type: "role", role: draft.subjectId }
      : { type: draft.subjectType, id: draft.subjectId },
  resourceId: draft.resourceId,
  action: draft.action,
  conditions: { ...(draft.restrictTools ? { tools: draft.tools } : {}), ...toArgumentInput(draft.argumentLimits, valueTypeOf) },
  expiresAt: draft.expiry === "" ? null : expiryInput(draft.expiry)
})

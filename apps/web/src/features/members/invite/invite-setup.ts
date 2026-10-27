import type { Action, ArgumentValue, InviteAccess, ProjectId, TeamId } from "@pc/domain"
import { DateTime } from "effect"
import type { ValueTypeOf } from "@/features/access/argument-limits/argument-limits"
import { limitsOf } from "@/features/access/argument-limits/argument-limits"
import { emptyGrantDraft, type GrantDraft, toGrantInput } from "@/features/access/grant-draft"

/** One direct grant being set up; `key` keeps its editor stable while others are added or removed. */
export interface GrantItem {
  readonly key: number
  readonly draft: GrantDraft
}

/**
 * What the invited person gets when they accept. `projectIds` only remembers which projects' resources
 * were added in one go; projects have no members, so it is never sent.
 */
export interface InviteSetup {
  readonly teamIds: ReadonlyArray<TeamId>
  readonly projectIds: ReadonlyArray<ProjectId>
  readonly grants: ReadonlyArray<GrantItem>
}

export const emptySetup: InviteSetup = { teamIds: [], projectIds: [], grants: [] }

export const grantItem = (key: number, resourceId: string, action: Action = "use"): GrantItem => ({
  key,
  draft: { ...emptyGrantDraft, subjectType: "user", resourceId, action }
})

export const nextKey = (setup: InviteSetup): number => Math.max(0, ...setup.grants.map((item) => item.key)) + 1

/** The candidate `InviteAccess`; the domain schema validates ids, levels, limits and expiry on submit. */
export const toInviteAccess = (setup: InviteSetup, valueTypeOf: (key: number) => ValueTypeOf) => ({
  teamIds: setup.teamIds,
  grants: setup.grants.map((item) => {
    const { resourceId, action, conditions, expiresAt } = toGrantInput(item.draft, valueTypeOf(item.key))
    return { resourceId, action, conditions, expiresAt }
  })
})

const looksTyped = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?|true|false)$/

/** Text an argument value is typed back in as: quoted where bare text would read as a number or boolean. */
const valueText = (value: ArgumentValue): string => (typeof value === "string" ? (looksTyped.test(value) ? `"${value}"` : value) : String(value))

/** A stored setup back in editor form, to change a pending invitation. */
export const fromInviteAccess = (access: InviteAccess): InviteSetup => ({
  teamIds: access.teamIds,
  projectIds: [],
  grants: access.grants.map((grant, index) => ({
    key: index + 1,
    draft: {
      ...emptyGrantDraft,
      subjectType: "user",
      resourceId: grant.resourceId,
      action: grant.action,
      restrictTools: grant.conditions.tools !== undefined,
      tools: grant.conditions.tools ?? [],
      argumentLimits: limitsOf(grant.conditions.arguments).map((limit, row) => ({ key: row + 1, tool: limit.tool, path: limit.path, values: limit.values.map(valueText) })),
      expiry: grant.expiresAt === null ? "" : DateTime.formatIso(grant.expiresAt).slice(0, 10)
    }
  }))
})

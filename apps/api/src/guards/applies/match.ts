import type { Guard, GuardActorRef, GuardApplies, GuardId, Principal, ResourceId, ToolAccess } from "@pc/domain"

/** What the gateway knows about a call before any classifier sees it. */
export interface CallFacts {
  readonly resourceId: ResourceId
  /** The upstream tool name (`GatewayTool.operation`). */
  readonly tool: string
  /** From the tool's annotations or catalog entry; absent or `unknown` counts as "may change". */
  readonly access: ToolAccess | undefined
  readonly principal: Principal
}

const isCaller = (principal: Principal) => (ref: GuardActorRef): boolean => {
  switch (ref._tag) {
    case "Role":
      return principal.role === ref.role
    case "Team":
      return principal.teamIds.includes(ref.teamId)
    case "User":
      return principal._tag === "User" && principal.userId === ref.userId
  }
}

const toolIn = (applies: GuardApplies, call: CallFacts): boolean => {
  const scope = applies.tools?.find((candidate) => candidate.resourceId === call.resourceId)
  if (scope === undefined || scope.only.includes(call.tool)) return true
  // Left out by name only when verify saw the tool and found the rule is not about it; a new tool stays in.
  return !scope.known.includes(call.tool)
}

/**
 * Whether a guard's accepted filter covers a call, so the classifier must judge it. Deterministic, and it
 * fails closed: no filter, a dimension it does not know or anything unexpected counts as covered.
 */
export const covers = (applies: GuardApplies | null, call: CallFacts): boolean => {
  if (applies === null) return true
  try {
    if (applies.resourceIds.length > 0 && !applies.resourceIds.includes(call.resourceId)) return false
    if (!toolIn(applies, call)) return false
    if (applies.operations === "changes" && call.access === "read") return false
    const actors = applies.actors
    if (actors === undefined) return true
    const named = actors.refs.some(isCaller(call.principal))
    return actors.kind === "only" ? named : actors.kind === "except" ? !named : true
  } catch {
    return true
  }
}

/** The audit's view of which guards a call was checked against; ids of skipped guards only while few. */
export interface GuardsChecked {
  readonly evaluated: number
  readonly skipped: number
  readonly skippedIds?: ReadonlyArray<GuardId>
}

const MaxListed = 8

/** Splits the guards in scope into those the classifier judges on this call and those their filter skips. */
export const selectGuards = (inScope: ReadonlyArray<Guard>, active: number, call: CallFacts) => {
  const evaluated = inScope.filter((guard) => covers(guard.applies, call))
  const filtered = inScope.filter((guard) => !evaluated.includes(guard)).map((guard) => guard.id)
  const skipped = active - evaluated.length
  const checked: GuardsChecked = {
    evaluated: evaluated.length,
    skipped,
    // Out-of-scope guards are counted, not listed: only the ones a filter skipped are named, and only while few.
    ...(filtered.length > 0 && filtered.length <= MaxListed ? { skippedIds: filtered } : {})
  }
  return { evaluated, checked }
}

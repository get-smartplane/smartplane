import type { ActionAudience } from "@pc/domain"

export interface AudiencedAction {
  readonly name: string
  readonly displayName: string
  readonly audience: ActionAudience | null
}

/** "Create Issue (Agent)", "Create issue" and "create-issue" all name the same operation. */
export const operationKey = (displayName: string): string =>
  displayName.toLowerCase().replace(/\s*\((?:agent|ai)\)\s*$/, "").replace(/[^a-z0-9]/g, "")

/**
 * Pieces often ship an agent-oriented variant (`audience: "ai"`, flat inputs) next to the classic action
 * built for the flow builder (`audience: "human"`, live dropdowns). When both perform the same operation
 * (same display name, ignoring an "(Agent)"/"(AI)" suffix), agents get only the AI variant. Actions for
 * `both` audiences, or without a counterpart, are never hidden. Returns classic name -> AI variant name.
 */
export const supersededBy = (actions: ReadonlyArray<AudiencedAction>): ReadonlyMap<string, string> => {
  const aiByOperation = new Map<string, string>()
  for (const action of actions) {
    const key = operationKey(action.displayName)
    if (action.audience === "ai" && !aiByOperation.has(key)) aiByOperation.set(key, action.name)
  }
  return new Map(actions.flatMap((action) => {
    const replacement = action.audience === "human" ? aiByOperation.get(operationKey(action.displayName)) : undefined
    return replacement === undefined ? [] : [[action.name, replacement] as const]
  }))
}

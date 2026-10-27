import type { IntegrationAction } from "@pc/domain"

export type ActionGroup = "reads" | "changes"

export const actionGroups: ReadonlyArray<{ readonly group: ActionGroup; readonly title: string; readonly description: string }> = [
  { group: "reads", title: "Read & search", description: "Look things up without changing anything. A use grant covers these." },
  { group: "changes", title: "Changes things", description: "Create, update, send or delete. These need a write grant." }
]

/** Reads and searches need `use`; everything else (including unclassified actions) needs `write`. */
export const groupOf = (action: IntegrationAction): ActionGroup => (action.requiredAction === "use" ? "reads" : "changes")

export const isOffered = (action: IntegrationAction): boolean => action.support.status === "supported"

/** Actions agents can actually get: supported, and on the resource's allow-list when it has one. */
export const enabledActions = (
  actions: ReadonlyArray<IntegrationAction>,
  allowList: ReadonlyArray<string> | undefined
): ReadonlyArray<IntegrationAction> => actions.filter((action) => isOffered(action) && (allowList === undefined || allowList.includes(action.name)))

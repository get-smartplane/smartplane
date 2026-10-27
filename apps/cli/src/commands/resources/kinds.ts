import type { ResourceKind } from "@pc/domain"

/** CLI spelling (kebab-case) for each resource kind, in the order the dashboard lists them. */
export const kindChoices: ReadonlyArray<readonly [string, ResourceKind]> = [
  ["mcp-server", "mcp_server"],
  ["tool", "tool"],
  ["skill", "skill"],
  ["database", "database"],
  ["api", "api"],
  ["integration", "integration"],
  ["secret", "secret"],
  ["variable", "variable"]
]

export const kindLabel = (kind: ResourceKind): string => kind.replace("_", "-")

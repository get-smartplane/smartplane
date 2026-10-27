import type { IntegrationAction, Resource } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { enabledActions } from "@/features/integrations/actions/action-groups"
import { optionalPieceAtom } from "@/features/integrations/atoms"
import { allResourcesAtom } from "@/features/resources/atoms"
import type { ValueTypeOf } from "./argument-limits/argument-limits"
import { argumentsOf } from "./argument-limits/input-schema"

/** Where a grant's tool names come from: a piece's actions (known), an MCP server's tools (typed in), or one tool. */
export type ToolSource =
  | { readonly kind: "integration"; readonly resource: Resource; readonly actions: ReadonlyArray<IntegrationAction> }
  | { readonly kind: "mcp_server"; readonly resource: Resource }
  | { readonly kind: "tool"; readonly resource: Resource; readonly toolName: string }

/** The chosen resource's tools, for the allow-list and argument limits; undefined for kinds without tools. */
export const useToolSource = (resourceId: string): ToolSource | undefined => {
  const resource = useQueryData(allResourcesAtom, []).find((candidate) => candidate.id === resourceId)
  const config = resource?.config
  const piece = useQueryData(optionalPieceAtom(config?.kind === "integration" ? config.pieceId : null), null)
  if (resource === undefined || config === undefined) return undefined
  switch (config.kind) {
    case "integration":
      return { kind: "integration", resource, actions: enabledActions(piece?.actions ?? [], config.actions) }
    case "mcp_server":
      return { kind: "mcp_server", resource }
    case "tool":
      return { kind: "tool", resource, toolName: config.toolName }
    default:
      return undefined
  }
}

/** Tool names to offer in pickers: every action, or the one tool; MCP servers list theirs only at run time. */
export const knownTools = (source: ToolSource): ReadonlyArray<string> =>
  source.kind === "integration" ? source.actions.map((action) => action.name) : source.kind === "tool" ? [source.toolName] : []

/**
 * What type a limited argument's values are, so "7" is sent as the number an action expects. Without a schema
 * for the path (MCP servers, single tools, paths deeper than the editor lists) the text itself decides.
 */
export const valueTypeOf = (source: ToolSource | undefined): ValueTypeOf => (tool, path) =>
  source?.kind === "integration"
    ? (argumentsOf(source.actions.find((action) => action.name === tool)?.inputSchema).find((arg) => arg.path === path)?.valueType ?? "unknown")
    : "unknown"

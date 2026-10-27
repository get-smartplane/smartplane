import type { GatewayTool } from "../provider"
import type { ToolResult } from "../sdk"
import { toolSummaryOf } from "../tool-summary"
import { CallToolName } from "./meta-tools"
import type { SearchHits } from "./rank"

/** A found tool in full: an agent should be able to call it from this alone, without a second lookup. */
const found = (tool: GatewayTool) => {
  const summary = toolSummaryOf(tool.definition)
  return {
    name: tool.definition.name,
    ...(summary.title === undefined ? {} : { title: summary.title }),
    description: tool.definition.description ?? "",
    access: summary.access,
    ...(tool.definition.annotations === undefined ? {} : { annotations: tool.definition.annotations }),
    inputSchema: { ...tool.definition.inputSchema, type: "object" }
  }
}

/** The same object as text (most clients read only text) and as `structuredContent`. */
export const searchResult = (hits: SearchHits, query: string, servers: ReadonlyArray<string>): ToolResult => {
  const tools = hits.tools.map(found)
  const hint = tools.length === 0
    ? `No tool matched "${query}". Try other words, or one of these servers: ${servers.join(", ") || "none"}.`
    : `Showing ${tools.length} of ${hits.total}. Run one with ${CallToolName} { "name": "<name>", "arguments": {...} }.`
  const body = { tools, total: hits.total, hint }
  return { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body, isError: false }
}

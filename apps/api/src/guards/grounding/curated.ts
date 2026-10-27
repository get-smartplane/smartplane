import { Schema } from "effect"
import { McpTool } from "../../mcp/sdk"
import github from "./curated/github.json"
import notion from "./curated/notion.json"

const CuratedTools = Schema.Struct({ source: Schema.String, tools: Schema.Array(McpTool) })

/**
 * Tools of catalog servers as their vendors publish them, so a rule about a per-user server (Notion) gets
 * real tool names even before the admin who verifies it has connected. Decoded at load: a malformed file
 * fails tests and startup, not a verify. Keyed by MCP catalog slug.
 */
export const curatedTools: ReadonlyMap<string, typeof CuratedTools.Type> = new Map([
  ["notion", Schema.decodeUnknownSync(CuratedTools)(notion)],
  ["github", Schema.decodeUnknownSync(CuratedTools)(github)]
])

import { InvalidInput } from "@pc/domain"
import { Effect, Schema } from "effect"
import type { GatewayTool } from "../provider"
import type { McpTool } from "../sdk"
import { serverOf } from "./index-tool"

export const SearchToolName = "smartplane__search_tools"
export const CallToolName = "smartplane__call_tool"
export const MaxSearchLimit = 20
export const DefaultSearchLimit = 8

export const isMetaTool = (name: string): boolean => name === SearchToolName || name === CallToolName

const SearchArgs = Schema.Struct({
  query: Schema.String,
  server: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MaxSearchLimit })))
})
export type SearchArgs = typeof SearchArgs.Type

const CallArgs = Schema.Struct({
  name: Schema.NonEmptyString,
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown))
})

export const decodeSearchArgs = (args: unknown) =>
  Schema.decodeUnknownEffect(SearchArgs)(args).pipe(
    Effect.mapError(() => new InvalidInput({ message: `expected { "query": string, "server"?: string, "limit"?: 1..${MaxSearchLimit} }` }))
  )

export const decodeCallArgs = (args: unknown) =>
  Schema.decodeUnknownEffect(CallArgs)(args).pipe(
    Effect.mapError(() => new InvalidInput({ message: "expected { \"name\": string, \"arguments\"?: object }" }))
  )

/** "linear (55), github (90)": which servers there are, so the agent knows what to search for. */
const serverSummary = (tools: ReadonlyArray<GatewayTool>, max = 30): string => {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    if (tool.target === null) continue
    const server = serverOf(tool.definition.name)
    counts.set(server, (counts.get(server) ?? 0) + 1)
  }
  const servers = [...counts].sort(([a], [b]) => (a < b ? -1 : 1))
  const shown = servers.slice(0, max).map(([server, count]) => `${server} (${count})`).join(", ")
  return servers.length > max ? `${shown}, +${servers.length - max} more` : shown
}

/** Built per principal: its description names the servers the caller can reach and how many tools each has. */
export const searchToolDefinition = (tools: ReadonlyArray<GatewayTool>): McpTool => ({
  name: SearchToolName,
  description: [
    "Find tools by what you want to do, e.g. \"create linear issue\" or \"list github pull requests\".",
    "Returns each match's full definition (name, description, input schema, read/write hints); then run one with smartplane__call_tool.",
    `Tools are named <server>__<tool>. Servers: ${serverSummary(tools) || "none"}.`
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What the tool should do, in a few words. Verbs matter: create/update/delete find writes, list/get/search find reads." },
      server: { type: "string", description: "Only tools of this server: the part before __ in a tool name, or the product name." },
      limit: { type: "integer", minimum: 1, maximum: MaxSearchLimit, description: `How many tools to return (default ${DefaultSearchLimit}).` }
    },
    required: ["query"]
  },
  annotations: { title: "Search tools", readOnlyHint: true, openWorldHint: false }
})

export const callToolDefinition: McpTool = {
  name: CallToolName,
  description:
    "Call a tool found with smartplane__search_tools, by its full name, with its arguments. The same grant checks, guard rules, approvals and audit apply as to a direct call.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The tool's full name, e.g. linear__create_issue." },
      arguments: { type: "object", description: "The tool's arguments, matching the input schema search returned." }
    },
    required: ["name"]
  },
  annotations: { title: "Call a tool", readOnlyHint: false, destructiveHint: true, openWorldHint: true }
}

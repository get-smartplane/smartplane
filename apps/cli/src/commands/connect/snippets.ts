import { Schema } from "effect"
import type { Host } from "../../app/host"
import { clients, type McpAuth, serverName } from "./clients"

/** Ready-to-paste config for every client, the same shapes `connect <client>` writes. */
export const Snippet = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  path: Schema.String,
  code: Schema.String
})
export type Snippet = typeof Snippet.Type

const claudeCommand = (url: string, auth: McpAuth) =>
  [`claude mcp add --transport http ${serverName} ${url}`, ...(auth.type === "token" ? [`--header "Authorization: Bearer ${auth.token}"`] : [])]
    .join(" \\\n  ")

export const snippets = (host: Host["Service"], url: string, auth: McpAuth): ReadonlyArray<Snippet> => [
  { id: "claude-code-cli", label: "Claude Code (command)", path: "-", code: claudeCommand(url, auth) },
  ...clients.map((client) => ({
    id: client.id,
    label: client.label,
    path: client.path(host, false),
    code: JSON.stringify({ [client.serversKey]: { [serverName]: client.entry(url, auth) } }, null, 2)
  }))
]

export const describeSnippets = (list: ReadonlyArray<Snippet>) =>
  list.map((snippet) => [`# ${snippet.label}${snippet.path === "-" ? "" : `: ${snippet.path}`}`, snippet.code].join("\n")).join("\n\n")

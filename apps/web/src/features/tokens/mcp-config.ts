/** Ready-to-paste client configs for the gateway. Token snippets are built only while the plaintext is on screen. */
export interface McpSnippet {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly code: string
}

const serverName = "smartplane"

const json = (value: unknown) => JSON.stringify(value, null, 2)

/** With headers, the client sends a `pc_` token; without, it discovers OAuth and signs in through WorkOS. */
const snippets = (url: string, headers: Readonly<Record<string, string>> | undefined, claudeCode: McpSnippet): ReadonlyArray<McpSnippet> => [
  claudeCode,
  {
    id: "mcp-json",
    label: ".mcp.json",
    hint: "Project-scoped config for Claude Code.",
    code: json({ mcpServers: { [serverName]: { type: "http", url, ...(headers ? { headers } : {}) } } })
  },
  {
    id: "cursor",
    label: "Cursor",
    hint: "Add to ~/.cursor/mcp.json.",
    code: json({ mcpServers: { [serverName]: { url, ...(headers ? { headers } : {}) } } })
  }
]

export const tokenSnippets = (url: string, token: string): ReadonlyArray<McpSnippet> =>
  snippets(url, { Authorization: `Bearer ${token}` }, {
    id: "claude-code",
    label: "Claude Code",
    hint: "Run in your terminal.",
    code: `claude mcp add --transport http ${serverName} ${url} \\\n  --header "Authorization: Bearer ${token}"`
  })

export const oauthSnippets = (url: string): ReadonlyArray<McpSnippet> =>
  snippets(url, undefined, {
    id: "claude-code",
    label: "Claude Code",
    hint: "Run in your terminal, then /mcp in Claude Code to sign in.",
    code: `claude mcp add --transport http ${serverName} ${url}`
  })

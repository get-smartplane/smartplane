import { oauthSnippets } from "@/features/tokens/mcp-config"

/** One tab of the "Connect your agent" step. */
export interface AgentClient {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly code: string
  /** Shown beside the copy button, e.g. that the CLI is not on npm yet. */
  readonly badge?: string
}

const serverName = "smartplane"
const json = (value: unknown) => JSON.stringify(value, null, 2)

/**
 * OAuth configs (nothing secret to paste): the client discovers sign-in and opens a browser. The shapes match
 * what `smartplane connect <client>` writes (apps/cli/src/commands/connect/clients.ts).
 */
export const agentClients = (url: string): ReadonlyArray<AgentClient> => {
  const claudeCode = oauthSnippets(url).find((snippet) => snippet.id === "claude-code")
  return [
    { id: "claude-code", label: "Claude Code", hint: claudeCode?.hint ?? "Run in your terminal, then /mcp in Claude Code to sign in.", code: claudeCode?.code ?? `claude mcp add --transport http ${serverName} ${url}` },
    { id: "cursor", label: "Cursor", hint: "Add to ~/.cursor/mcp.json, then enable smartplane under Settings > MCP.", code: json({ mcpServers: { [serverName]: { url } } }) },
    { id: "vscode", label: "VS Code", hint: "Add to .vscode/mcp.json, then run “MCP: List Servers” and start smartplane.", code: json({ servers: { [serverName]: { type: "http", url } } }) },
    {
      id: "claude-desktop",
      label: "Claude Desktop",
      hint: "Add to claude_desktop_config.json, then restart Claude Desktop. mcp-remote bridges it to the gateway.",
      code: json({ mcpServers: { [serverName]: { command: "npx", args: ["-y", "mcp-remote", url] } } })
    },
    {
      id: "cli",
      label: "CLI",
      hint: "Writes the config for you: claude-code, cursor, vscode or claude-desktop.",
      code: "npx smartplane connect claude-code",
      // The package is built (apps/cli, `bun run build:npm`) but not published yet.
      badge: "Coming soon to npm"
    }
  ]
}

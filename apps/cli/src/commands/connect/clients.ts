import type { Host } from "../../app/host"
import { claudeDesktopConfigPath, pathJoin } from "../../config/paths"

export const serverName = "smartplane"

/** How the client authenticates to `/mcp`: OAuth discovery (nothing secret in the file) or an embedded `pc_` token. */
export type McpAuth = { readonly type: "oauth" } | { readonly type: "token"; readonly token: string }

export type JsonObject = { readonly [key: string]: unknown }

export interface McpClient {
  readonly id: "claude-code" | "cursor" | "vscode" | "claude-desktop"
  readonly label: string
  /** The key servers live under in the client's config file. */
  readonly serversKey: "mcpServers" | "servers"
  /** True when the file sits in the project, where an embedded token could get committed. */
  readonly inProject: (local: boolean) => boolean
  readonly path: (host: Host["Service"], local: boolean) => string
  readonly entry: (url: string, auth: McpAuth) => JsonObject
  readonly after: string
}

const headers = (auth: McpAuth) => (auth.type === "token" ? { headers: { Authorization: `Bearer ${auth.token}` } } : {})

export const clients: ReadonlyArray<McpClient> = [
  {
    id: "claude-code",
    label: "Claude Code (.mcp.json)",
    serversKey: "mcpServers",
    inProject: () => true,
    path: (host) => pathJoin(host.platform, host.cwd, ".mcp.json"),
    entry: (url, auth) => ({ type: "http", url, ...headers(auth) }),
    after: "Start Claude Code in this directory and run /mcp to sign in."
  },
  {
    id: "cursor",
    label: "Cursor",
    serversKey: "mcpServers",
    inProject: (local) => local,
    path: (host, local) => pathJoin(host.platform, local ? host.cwd : host.home, ".cursor", "mcp.json"),
    entry: (url, auth) => ({ url, ...headers(auth) }),
    after: "Open Cursor Settings > MCP and enable smartplane."
  },
  {
    id: "vscode",
    label: "VS Code (.vscode/mcp.json)",
    serversKey: "servers",
    inProject: () => true,
    path: (host) => pathJoin(host.platform, host.cwd, ".vscode", "mcp.json"),
    entry: (url, auth) => ({ type: "http", url, ...headers(auth) }),
    after: "In VS Code, run \"MCP: List Servers\" and start smartplane."
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    serversKey: "mcpServers",
    inProject: () => false,
    path: (host) => claudeDesktopConfigPath(host),
    // Claude Desktop's config file only launches local (stdio) servers, so mcp-remote bridges to /mcp. The token
    // travels in env, not args, so it stays out of process listings.
    entry: (url, auth) =>
      auth.type === "token"
        ? { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${SMARTPLANE_AUTH}"], env: { SMARTPLANE_AUTH: `Bearer ${auth.token}` } }
        : { command: "npx", args: ["-y", "mcp-remote", url] },
    after: "Restart Claude Desktop."
  }
]

/** Well-known hosted MCP servers, as a starting point; the URL stays editable. */
export const mcpPresets: ReadonlyArray<{ readonly name: string; readonly url: string }> = [
  { name: "GitHub", url: "https://api.githubcopilot.com/mcp/" },
  { name: "Linear", url: "https://mcp.linear.app/mcp" },
  { name: "Notion", url: "https://mcp.notion.com/mcp" },
  { name: "Sentry", url: "https://mcp.sentry.dev/mcp" },
  { name: "Stripe", url: "https://mcp.stripe.com" }
]

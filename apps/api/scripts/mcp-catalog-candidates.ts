/**
 * Official remote MCP servers considered for the catalog that are not in it (yet), with where each URL came
 * from. `verify-mcp-catalog.ts` checks these beside the catalog, so a server that gains dynamic client
 * registration shows up as a candidate to promote.
 */
export interface Candidate {
  readonly slug: string
  readonly name: string
  readonly url: string
  readonly sourceUrl: string
  /** Why it is not in the catalog as `oauth-dcr`, as last observed; the script reports what it sees now. */
  readonly expected?: string
}

export const candidates: ReadonlyArray<Candidate> = [
  { slug: "asana", name: "Asana", url: "https://mcp.asana.com/v2/mcp", sourceUrl: "https://developers.asana.com/docs/integrating-with-asanas-mcp-server", expected: "no registration endpoint: needs a pre-registered client" },
  { slug: "hubspot", name: "HubSpot", url: "https://mcp.hubspot.com", sourceUrl: "https://developers.hubspot.com/docs/build-with-ai/remote-mcp-server", expected: "no registration endpoint: needs an MCP auth app created in HubSpot" },
  { slug: "paypal", name: "PayPal", url: "https://mcp.paypal.com/http", sourceUrl: "https://developer.paypal.com/ai-tools/mcp-server", expected: "the documented Streamable HTTP path answers 404; only the SSE path answers" },
  { slug: "box", name: "Box", url: "https://mcp.box.com", sourceUrl: "https://developer.box.com/guides/box-mcp/remote/", expected: "no registration endpoint: needs the Box MCP integration enabled and a client id" },
  { slug: "cloudflare-docs", name: "Cloudflare Docs", url: "https://docs.mcp.cloudflare.com/mcp", sourceUrl: "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/", expected: "public, no sign-in: add it as an MCP server without auth" }
]

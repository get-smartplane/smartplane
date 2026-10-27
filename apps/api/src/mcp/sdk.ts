import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { type CallToolResult, createMcpHandler, Server } from "@modelcontextprotocol/server"
import { Schema } from "effect"
import { registerSkillHandlers, skillCapabilities, type SkillHandlers } from "./sdk-skills"

/**
 * With `sdk-skills.ts`, the only module that touches the MCP SDK. Everything crossing it is decoded with these schemas, so the
 * rest of the gateway works with plain typed values and Effects.
 */
export const McpTool = Schema.Struct({
  name: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  inputSchema: Schema.Record(Schema.String, Schema.Unknown),
  /** MCP tool annotations (`readOnlyHint`, `destructiveHint`, ...): hints for clients, never trusted for policy. */
  annotations: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})
export type McpTool = typeof McpTool.Type

export const ToolResult = Schema.Struct({
  content: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  structuredContent: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  isError: Schema.optional(Schema.Boolean)
})
export type ToolResult = typeof ToolResult.Type

const decodeTools = Schema.decodeUnknownPromise(Schema.Array(McpTool))
const decodeResult = Schema.decodeUnknownPromise(ToolResult)

export const textResult = (text: string, isError = false): ToolResult => ({ content: [{ type: "text", text }], isError })

export interface GatewayHandlers extends SkillHandlers {
  readonly listTools: () => Promise<ReadonlyArray<McpTool>>
  readonly callTool: (name: string, args: Readonly<Record<string, unknown>>) => Promise<ToolResult>
}

/** A compact form of the built-in `smartplane` skill, for clients that read server instructions. */
export const gatewayInstructions = [
  "Smartplane: your organisation's approved tools and skills. Every call is checked against grants and guard rules, and audited.",
  "Tools are named <server>__<tool>. skills_list / skills_get return org skills (read the `smartplane` skill first); variables_get reads non-secret config.",
  "When smartplane__search_tools is listed, many tools are available; use smartplane__search_tools to find them, then smartplane__call_tool.",
  "Denied by your access grants: tell the user which access to request; do not retry or work around it.",
  "Denied by a guard rule: explain the rule; never rephrase, split or reroute the action to get past it.",
  "Needs approval: tell the user it waits for an approver (not themselves); do not loop. Not connected: give the user the connect link.",
  "Never ask for or write secrets (.env, config, code). Run commands needing secrets as `smartplane run -- <cmd>`; [smartplane:NAME] in output is masked on purpose.",
  "Never print, echo or encode secret values. Prefer read-only tools when exploring; say what you will do before destructive actions."
].join("\n")

/** Serves one Streamable HTTP request with a fresh, stateless server scoped to the caller's handlers. */
export const serveMcp = (request: Request, handlers: GatewayHandlers): Promise<Response> =>
  createMcpHandler(() => {
    const server = new Server(
      { name: "smartplane", title: "Smartplane", version: "0.1.0" },
      {
        capabilities: { tools: {}, ...skillCapabilities },
        instructions: gatewayInstructions
      }
    )
    server.setRequestHandler("tools/list", async () => ({
      tools: (await handlers.listTools()).map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema, type: "object" as const } }))
    }))
    // Upstream content blocks pass through unchanged; the SDK validates the result against the spec before sending.
    server.setRequestHandler("tools/call", async (request): Promise<CallToolResult> => {
      const result = await handlers.callTool(request.params.name, request.params.arguments ?? {})
      return { ...result, content: result.content.map((block) => ({ type: "text" as const, text: "", ...block })) }
    })
    registerSkillHandlers(server, handlers)
    return server
  }).fetch(request)

export interface UpstreamTarget {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

/** The upstream answered 401: the credential was refused (expired or revoked), so a refresh may help. */
export class UpstreamUnauthorizedError extends Error {
  override readonly name = "UpstreamUnauthorizedError"
}

/** The upstream answered with a redirect, which is never followed. */
export class UpstreamRedirectError extends Error {
  override readonly name = "UpstreamRedirectError"
}

const isRedirect = (status: number): boolean => status >= 300 && status < 400

const withClient = async <A>(target: UpstreamTarget, use: (client: Client) => Promise<A>): Promise<A> => {
  let unauthorized = false
  let redirected: number | undefined
  // Without an auth provider the SDK reports a 401 as a plain error; the status is read off the response instead.
  // Redirects are refused, not followed: following one would carry the credential header to another URL.
  const observed: typeof fetch = async (input, init) => {
    const response = await fetch(input, { ...init, redirect: "manual" })
    if (response.status === 401) unauthorized = true
    if (isRedirect(response.status)) {
      redirected = response.status
      throw new UpstreamRedirectError(`the MCP server answered with a redirect (HTTP ${response.status}); redirects are not followed`)
    }
    return response
  }
  const client = new Client({ name: "smartplane-gateway", version: "0.1.0" })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(target.url), { requestInit: { headers: { ...target.headers } }, fetch: observed }))
    try {
      return await use(client)
    } finally {
      await client.close()
    }
  } catch (error) {
    if (redirected !== undefined) throw new UpstreamRedirectError(`the MCP server answered with a redirect (HTTP ${redirected}); redirects are not followed`)
    throw unauthorized ? new UpstreamUnauthorizedError("the MCP server refused the credential (HTTP 401)") : error
  }
}

export const listUpstreamTools = (target: UpstreamTarget): Promise<ReadonlyArray<McpTool>> =>
  withClient(target, async (client) => decodeTools((await client.listTools()).tools))

export const callUpstreamTool = (target: UpstreamTarget, name: string, args: Readonly<Record<string, unknown>>): Promise<ToolResult> =>
  withClient(target, async (client) => decodeResult(await client.callTool({ name, arguments: { ...args } })))

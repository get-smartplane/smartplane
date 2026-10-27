import { ProtocolError, ProtocolErrorCode, ResourceNotFoundError, type Server } from "@modelcontextprotocol/server"
import type { InvalidInput, NotFound } from "@pc/domain"
import type { Result } from "effect"

/** What the gateway hands the SDK for MCP prompts and resources; the SDK validates the wire shape. */
export interface McpPrompt {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly arguments: ReadonlyArray<{ readonly name: string; readonly description?: string; readonly required?: boolean }>
}

export interface McpPromptText {
  readonly description: string
  readonly text: string
}

/** `smartplane.dev/*` keys the CLI uses to write skill folders to disk; see docs/skills.md. */
export type SkillFileMeta = Readonly<Record<string, string>>

export interface McpResource {
  readonly uri: string
  readonly name: string
  readonly title: string
  readonly description: string
  readonly mimeType: string
  readonly size: number
  readonly _meta: SkillFileMeta
}

/** Text files come back as `text`, binaries as base64 `blob`. */
export type McpResourceContents =
  | { readonly uri: string; readonly mimeType: string; readonly text: string; readonly _meta: SkillFileMeta }
  | { readonly uri: string; readonly mimeType: string; readonly blob: string; readonly _meta: SkillFileMeta }

/** `NotFound`: no such prompt or resource for this caller. `InvalidInput`: bad prompt arguments. */
export type Refused<A> = Result.Result<A, InvalidInput | NotFound>

export interface SkillHandlers {
  readonly listPrompts: () => Promise<ReadonlyArray<McpPrompt>>
  readonly getPrompt: (name: string, args: Readonly<Record<string, string>>) => Promise<Refused<McpPromptText>>
  readonly listResources: () => Promise<ReadonlyArray<McpResource>>
  readonly readResource: (uri: string) => Promise<Refused<McpResourceContents>>
}

/**
 * The spec answers unknown prompts, missing arguments and unknown resources with JSON-RPC -32602; the
 * resource case carries the URI so clients can tell which read failed.
 */
const settle = <A>(result: Refused<A>, uri?: string): A => {
  if (result._tag === "Success") return result.success
  const refusal = result.failure
  if (refusal._tag === "NotFound" && uri !== undefined) throw new ResourceNotFoundError(uri)
  const message = refusal._tag === "NotFound" ? `Unknown prompt "${refusal.id}".` : refusal.message
  throw new ProtocolError(ProtocolErrorCode.InvalidParams, message)
}

/**
 * Skills as MCP prompts (slash commands in Claude Code, Cursor and VS Code) and as `skill://` resources.
 * No `listChanged`: each request gets a fresh stateless server, so there is no session to notify; clients
 * see grant changes the next time they list.
 */
export const skillCapabilities = { prompts: {}, resources: {} }

export const registerSkillHandlers = (server: Server, handlers: SkillHandlers): void => {
  server.setRequestHandler("prompts/list", async () => ({
    prompts: (await handlers.listPrompts()).map((prompt) => ({ ...prompt, arguments: prompt.arguments.map((arg) => ({ ...arg })) }))
  }))
  server.setRequestHandler("prompts/get", async (request) => {
    const prompt = settle(await handlers.getPrompt(request.params.name, request.params.arguments ?? {}))
    return { description: prompt.description, messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt.text } }] }
  })
  server.setRequestHandler("resources/list", async () => ({
    resources: (await handlers.listResources()).map((resource) => ({ ...resource, _meta: { ...resource._meta } }))
  }))
  server.setRequestHandler("resources/templates/list", async () => ({ resourceTemplates: [] }))
  server.setRequestHandler("resources/read", async (request) => {
    const contents = settle(await handlers.readResource(request.params.uri), request.params.uri)
    return { contents: [{ ...contents, _meta: { ...contents._meta } }] }
  })
}

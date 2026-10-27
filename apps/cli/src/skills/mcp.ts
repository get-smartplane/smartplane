import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { Context, Effect, Layer, Redacted, type Scope } from "effect"
import { authFailure, type CliFailure, failure } from "../app/failure"
import { cliVersion } from "../version"

/** The MCP calls the CLI makes (skill sync, `init`'s check). Results are raw wire JSON, decoded by the caller. */
export interface McpResources {
  readonly listResources: () => Promise<unknown>
  readonly listPrompts: () => Promise<unknown>
  readonly readResource: (uri: string) => Promise<unknown>
  readonly listTools: () => Promise<unknown>
}

/** Narrows the gateway to org-wide resources plus one project's (see `.smartplane/project.json`). */
export const ProjectHeader = "x-smartplane-project"

export interface McpOptions {
  readonly projectId?: string
}

const isUnauthorized = (cause: unknown) => /\b401\b|unauthori[sz]ed/i.test(String(cause))

/** One authenticated MCP session to the Smartplane gateway; the only module that touches the MCP SDK. */
export class McpConnection extends Context.Service<McpConnection, {
  readonly open: (mcpUrl: string, token: Redacted.Redacted<string>, options?: McpOptions) => Effect.Effect<McpResources, CliFailure, Scope.Scope>
}>()("@pc/cli/McpConnection") {
  static readonly layer = Layer.succeed(McpConnection, McpConnection.of({
    open: (mcpUrl, token, options = {}) => {
      const toFailure = (cause: unknown) =>
        isUnauthorized(cause) ? authFailure("The MCP endpoint rejected the token.") : failure(`MCP request to ${mcpUrl} failed: ${String(cause)}`)
      const call = <A>(run: () => Promise<A>) => () => run().catch((cause: unknown) => Promise.reject(toFailure(cause)))
      return Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const client = new Client({ name: "smartplane-cli", version: cliVersion })
            const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
              requestInit: {
                headers: {
                  Authorization: `Bearer ${Redacted.value(token)}`,
                  ...(options.projectId === undefined ? {} : { [ProjectHeader]: options.projectId })
                }
              }
            })
            await client.connect(transport)
            return client
          },
          catch: toFailure
        }),
        (client) => Effect.promise(() => client.close().catch(() => undefined))
      ).pipe(Effect.map((client): McpResources => ({
        listResources: call(() => client.listResources()),
        listPrompts: call(() => client.listPrompts()),
        readResource: (uri) => call(() => client.readResource({ uri }))(),
        listTools: call(() => client.listTools())
      })))
    }
  }))

  /** A fake gateway for tests: answers from in-memory wire JSON and counts reads. */
  static readonly layerFake = (fake: McpResources, opened: Array<McpOptions> = []) =>
    Layer.succeed(McpConnection, McpConnection.of({
      open: (_url, _token, options = {}) => Effect.sync(() => {
        opened.push(options)
        return fake
      })
    }))
}

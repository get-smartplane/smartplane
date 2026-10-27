import { Context, Effect, Layer, Schema } from "effect"
import { callUpstreamTool, listUpstreamTools, type McpTool, type ToolResult, type UpstreamTarget, UpstreamUnauthorizedError } from "./sdk"

/** The upstream refused the credential (HTTP 401). */
export class UpstreamUnauthorized extends Schema.TaggedError<UpstreamUnauthorized>()("UpstreamUnauthorized", {}) {}

/** Any other upstream failure, with a message safe to show (it never contains the credential). */
export class UpstreamCallFailed extends Schema.TaggedError<UpstreamCallFailed>()("UpstreamCallFailed", { message: Schema.String }) {}

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof UpstreamUnauthorizedError ? new UpstreamUnauthorized() : new UpstreamCallFailed({ message: cause instanceof Error ? cause.message : String(cause) })
  })

/** The MCP client calls, as Effects; a seam so tests can stand in for upstream servers. */
export class UpstreamClient extends Context.Service<UpstreamClient, {
  readonly listTools: (target: UpstreamTarget) => Effect.Effect<ReadonlyArray<McpTool>, UpstreamUnauthorized | UpstreamCallFailed>
  readonly callTool: (target: UpstreamTarget, tool: string, args: Readonly<Record<string, unknown>>) => Effect.Effect<ToolResult, UpstreamUnauthorized | UpstreamCallFailed>
}>()("api/mcp/UpstreamClient") {
  static readonly layer = Layer.succeed(UpstreamClient, {
    listTools: (target) => attempt(() => listUpstreamTools(target)),
    callTool: (target, tool, args) => attempt(() => callUpstreamTool(target, tool, args))
  })
}

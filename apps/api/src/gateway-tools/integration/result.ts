import { UpstreamFailure } from "@pc/domain"
import type { RunError, RunOutput } from "@pc/integrations/rpc"
import { textResult, type ToolResult } from "../../mcp/sdk"

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

/** An action's output as an MCP result: JSON text, plus structured content when the output is an object. */
export const toToolResult = ({ output, truncated }: RunOutput): ToolResult => ({
  ...textResult(JSON.stringify(output, null, 2) + (truncated ? "\n(output truncated)" : "")),
  ...(isObject(output) && !truncated ? { structuredContent: output } : {})
})

/** What the agent is told when a run fails: actionable, without credentials or internals. */
export const toFailure = (upstream: string, error: RunError | UpstreamFailure): UpstreamFailure => {
  switch (error._tag) {
    case "UpstreamFailure":
      return error
    case "AuthFailed":
      return new UpstreamFailure({ upstream, message: `the provider rejected the integration's credentials (${error.message}); an admin may need to reconnect it` })
    case "UpstreamError":
      return new UpstreamFailure({ upstream, message: error.status === null ? error.message : `HTTP ${error.status}: ${error.message}` })
    case "InvalidInput":
      return new UpstreamFailure({ upstream, message: `invalid arguments: ${error.message}` })
    case "UnknownAction":
    case "UnsupportedAction":
    case "Timeout":
      return new UpstreamFailure({ upstream, message: error.message })
  }
}

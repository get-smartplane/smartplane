import { type Principal, ReadOnlyRefused } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { IntegrationCatalog } from "../integrations/catalog"
import { ToolCatalog } from "./catalog"
import { ToolPipeline } from "./pipeline"
import type { GatewayTool } from "./provider"
import type { ToolResult } from "./sdk"
import { toolSummaryOf } from "./tool-summary"

/**
 * Why a tool may not run as a lookup, or `undefined` when it is read-only by every source Smartplane has:
 * its MCP annotations say `readOnlyHint` and, for an integration action, the piece catalog classifies it as
 * read or search. Unknown counts as not read-only; databases and HTTP APIs are never looked up this way.
 */
export const notReadOnly = (tool: GatewayTool, catalog: IntegrationCatalog["Service"]): string | undefined => {
  const config = tool.target?.config
  if (config === undefined) return "built-in tools are not lookups"
  if (config.kind !== "mcp_server" && config.kind !== "integration" && config.kind !== "tool") return `${config.kind} tools are never used for lookups`
  const access = toolSummaryOf(tool.definition).access
  if (access !== "read") return `the tool is not marked read-only (${access})`
  if (config.kind === "integration") {
    const classification = Option.getOrUndefined(Option.map(catalog.action(config.pieceId, tool.operation), (action) => action.classification))
    if (classification !== "read" && classification !== "search") return `the integration catalog classifies it as ${classification ?? "unknown"}`
  }
  return undefined
}

/**
 * Runs read-only tools on an admin's behalf (looking up what a rule names) through the normal gateway path:
 * the admin's catalog (their grants and their connection, shared or their own), then the same pipeline as an
 * agent's call, so guards apply and every call is audited. Anything not known to be read-only is refused.
 */
export class GatewayReads extends Context.Service<GatewayReads, {
  readonly run: (principal: Principal, tool: string, args: Readonly<Record<string, unknown>>) => Effect.Effect<ToolResult, ReadOnlyRefused>
}>()("api/mcp/GatewayReads") {
  static readonly layer = Layer.effect(
    GatewayReads,
    Effect.gen(function*() {
      const catalog = yield* ToolCatalog
      const pipeline = yield* ToolPipeline
      const integrations = yield* IntegrationCatalog

      const run = Effect.fn("GatewayReads.run")(function*(principal: Principal, name: string, args: Readonly<Record<string, unknown>>) {
        const tool = (yield* catalog.forPrincipal(principal)).get(name)
        if (tool === undefined) return yield* new ReadOnlyRefused({ tool: name, reason: "not available to you: no grant, or the account is not connected" })
        const refused = notReadOnly(tool, integrations)
        yield* Effect.annotateCurrentSpan({ "mcp.tool": name, "lookup.refused": refused ?? "" })
        if (refused !== undefined) return yield* new ReadOnlyRefused({ tool: name, reason: refused })
        return yield* pipeline.run(principal, tool, args)
      })

      return GatewayReads.of({ run })
    })
  )
}

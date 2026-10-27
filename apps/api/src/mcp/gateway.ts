import type { DenyReason, Principal } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { type Catalog, ToolCatalog } from "./catalog"
import { ToolPipeline } from "./pipeline"
import { type McpTool, textResult, type ToolResult } from "./sdk"
import { serverOf } from "./search/index-tool"
import { CallToolName, callToolDefinition, decodeCallArgs, decodeSearchArgs, DefaultSearchLimit, isMetaTool, SearchToolName, searchToolDefinition } from "./search/meta-tools"
import { type ToolsMode, ToolSearchSettings, usesSearch } from "./search/mode"
import { searchTools } from "./search/rank"
import { searchResult } from "./search/search-result"
import { suggestNames, unknownToolText } from "./search/suggest"

/**
 * The MCP gateway: one endpoint in front of every tool source a principal is granted. Tools come from
 * pluggable providers (see `ToolProviders`); every call runs through the same `ToolPipeline`. Above the org's
 * threshold `tools/list` offers search instead of every tool (see docs/tool-search.md); the meta-tools are
 * always callable and every real tool stays callable by name, listed or not.
 */
export class McpGateway extends Context.Service<McpGateway, {
  /** `mode` is the `x-smartplane-tools` override; without it the org's threshold decides. */
  readonly listTools: (principal: Principal, mode?: ToolsMode) => Effect.Effect<ReadonlyArray<McpTool>>
  readonly callTool: (principal: Principal, name: string, args: Readonly<Record<string, unknown>>) => Effect.Effect<ToolResult>
}>()("api/mcp/McpGateway") {
  static readonly layer = Layer.effect(
    McpGateway,
    Effect.gen(function*() {
      const catalog = yield* ToolCatalog
      const pipeline = yield* ToolPipeline
      const audit = yield* AuditLog
      const settings = yield* ToolSearchSettings

      const listTools = Effect.fn("McpGateway.listTools")(function*(principal: Principal, mode?: ToolsMode) {
        const tools = Array.from((yield* catalog.forPrincipal(principal)).values())
        const search = usesSearch(tools.length, mode === undefined ? yield* settings.threshold(principal.orgId) : null, mode)
        yield* Effect.annotateCurrentSpan({ "mcp.tools": tools.length, "mcp.tool_search": search })
        // Built-ins stay listed: there are three, and agents need them before anything else.
        const listed = search
          ? [searchToolDefinition(tools), callToolDefinition, ...tools.filter((tool) => tool.target === null).map((tool) => tool.definition)]
          : tools.map((tool) => tool.definition)
        yield* audit.by(principal, "mcp.tools_listed", null, { count: listed.length, tokenId: principal.tokenId, ...(search ? { mode: "search", available: tools.length } : {}) })
        return listed
      })

      const unknown = Effect.fn("McpGateway.unknownTool")(function*(principal: Principal, tools: Catalog, name: string, via: string | undefined) {
        const reasons: ReadonlyArray<DenyReason> = [{ _tag: "UnknownTool", tool: name }]
        yield* audit.by(principal, "policy.denied", null, { tool: name, reasons, ...(via === undefined ? {} : { via }) })
        return textResult(unknownToolText(name, suggestNames([...tools.values()], name)), true)
      })

      const dispatch = (principal: Principal, tools: Catalog, name: string, args: Readonly<Record<string, unknown>>, via?: string) => {
        const tool = tools.get(name)
        return tool === undefined ? unknown(principal, tools, name, via) : pipeline.run(principal, tool, args, via)
      }

      const search = Effect.fn("McpGateway.searchTools")(function*(principal: Principal, tools: Catalog, args: Readonly<Record<string, unknown>>) {
        const decoded = yield* Effect.result(decodeSearchArgs(args))
        if (decoded._tag === "Failure") return textResult(`Invalid arguments: ${decoded.failure.message}`, true)
        const { query, server, limit = DefaultSearchLimit } = decoded.success
        const all = [...tools.values()]
        const hits = searchTools(all, query, { server, limit })
        yield* Effect.annotateCurrentSpan({ "mcp.search.total": hits.total })
        yield* audit.by(principal, "mcp.tools_listed", null, {
          count: hits.tools.length,
          tokenId: principal.tokenId,
          search: { query, ...(server === undefined ? {} : { server }), total: hits.total }
        })
        const servers = [...new Set(all.filter((tool) => tool.target !== null).map((tool) => serverOf(tool.definition.name)))].sort()
        return searchResult(hits, query, servers)
      })

      /** Unwraps to the real tool, so the pipeline (grants, guards, approvals) and the audit see that tool. */
      const callThrough = Effect.fn("McpGateway.callThrough")(function*(principal: Principal, tools: Catalog, args: Readonly<Record<string, unknown>>) {
        const decoded = yield* Effect.result(decodeCallArgs(args))
        if (decoded._tag === "Failure") return textResult(`Invalid arguments: ${decoded.failure.message}`, true)
        const { name, arguments: inner = {} } = decoded.success
        yield* Effect.annotateCurrentSpan({ "mcp.tool": name, "mcp.via": CallToolName })
        if (isMetaTool(name)) return textResult(`Call ${name} directly, not through ${CallToolName}.`, true)
        return yield* dispatch(principal, tools, name, inner, CallToolName)
      })

      const callTool = Effect.fn("McpGateway.callTool")(function*(principal: Principal, name: string, args: Readonly<Record<string, unknown>>) {
        yield* Effect.annotateCurrentSpan({ "mcp.tool": name, "org.id": principal.orgId, "principal.kind": principal._tag })
        const tools = yield* catalog.forPrincipal(principal)
        if (name === SearchToolName) return yield* search(principal, tools, args)
        if (name === CallToolName) return yield* callThrough(principal, tools, args)
        return yield* dispatch(principal, tools, name, args)
      })

      return McpGateway.of({ listTools, callTool })
    })
  )
}

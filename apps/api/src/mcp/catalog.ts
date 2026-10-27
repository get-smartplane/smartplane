import type { Principal } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { actorOf } from "../audit/actor"
import { isMetaTool } from "./search/meta-tools"
import { type CallerScope, type GatewayTool, ToolProviders } from "./provider"

/** The tools a principal may call right now, by exposed name. */
export type Catalog = ReadonlyMap<string, GatewayTool>

/**
 * Merges every provider's tools for one caller. Access is resolved once and shared. A provider that
 * fails only hides its own tools; a name already taken by an earlier provider is dropped, never shadowed.
 */
export class ToolCatalog extends Context.Service<ToolCatalog, {
  readonly forPrincipal: (principal: Principal) => Effect.Effect<Catalog>
}>()("api/mcp/ToolCatalog") {
  static readonly layer = Layer.effect(
    ToolCatalog,
    Effect.gen(function*() {
      const providers = yield* ToolProviders
      const policy = yield* AccessPolicy

      const forPrincipal = Effect.fn("ToolCatalog.forPrincipal")(function*(principal: Principal) {
        const scope: CallerScope = { principal, actor: actorOf(principal), access: yield* policy.resolve(principal) }
        const listed = yield* Effect.forEach(providers, (provider) =>
          provider.tools(scope).pipe(
            Effect.withSpan("ToolProvider.tools", { attributes: { "mcp.provider": provider.source } }),
            Effect.catchDefect((defect) =>
              Effect.as(Effect.logWarning("tool provider failed", { source: provider.source, defect: String(defect) }), [])
            )
          ), { concurrency: "unbounded" })
        const catalog = new Map<string, GatewayTool>()
        for (const tool of listed.flat()) {
          // The meta-tools' names are reserved, so `smartplane__call_tool` can never mean an upstream tool.
          if (isMetaTool(tool.definition.name)) {
            yield* Effect.logWarning("reserved gateway tool name dropped", { tool: tool.definition.name })
            continue
          }
          if (catalog.has(tool.definition.name)) {
            yield* Effect.logWarning("duplicate gateway tool name dropped", { tool: tool.definition.name })
            continue
          }
          catalog.set(tool.definition.name, tool)
        }
        yield* Effect.annotateCurrentSpan({ "mcp.providers": providers.length, "mcp.tools": catalog.size })
        return catalog satisfies Catalog
      })

      return ToolCatalog.of({ forPrincipal })
    })
  )
}

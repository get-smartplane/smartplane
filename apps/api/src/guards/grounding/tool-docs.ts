import { type GuardToolSource, isSupported, type Principal, type Resource } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { actorOf } from "../../audit/actor"
import { IntegrationCatalog } from "../../integrations/catalog"
import { Upstream } from "../../mcp/upstream"
import { ResourcesRepo } from "../../resources/resources-repo"
import { curatedTools } from "./curated"
import { catalogEntryOf } from "./products"
import type { TargetMatch } from "./targets"
import { fromAction, fromListing, type ToolDoc } from "./tool-doc"

/** A target's tools, where they came from, and (with no tools) what the catalog says the server does. */
export interface TargetTools {
  readonly target: TargetMatch
  readonly source: GuardToolSource
  readonly tools: ReadonlyArray<ToolDoc>
  readonly summary?: string
}

/**
 * Collects the real tools of each target for the compiler. Integrations read the bundled piece catalog. MCP
 * servers use the cached upstream listing through the shared connection, or the verifying admin's own
 * connection for a per-user server (the same rules as `tools/list`); without one, Smartplane's curated copy
 * of the vendor's published tools, else only the catalog description. Never calls a tool upstream.
 */
export class GuardToolDocs extends Context.Service<GuardToolDocs, {
  readonly forTargets: (principal: Principal, targets: ReadonlyArray<TargetMatch>) => Effect.Effect<ReadonlyArray<TargetTools>>
}>()("api/guards/GuardToolDocs") {
  static readonly layer = Layer.effect(
    GuardToolDocs,
    Effect.gen(function*() {
      const catalog = yield* IntegrationCatalog
      const upstream = yield* Upstream
      const resources = yield* ResourcesRepo

      const fallback = (target: TargetMatch, server: Resource): TargetTools => {
        const entry = catalogEntryOf(server)
        const curated = entry === undefined ? undefined : curatedTools.get(entry.slug)
        if (curated !== undefined) return { target, source: "curated", tools: curated.tools.map((tool) => fromListing(server, tool)) }
        const summary = entry === undefined ? undefined : `${entry.description} Can: ${entry.capabilities.join("; ")}.`
        return { target, source: "none", tools: [], ...(summary === undefined ? {} : { summary }) }
      }

      const listed = (principal: Principal, target: TargetMatch, server: Resource, only?: string) =>
        upstream.listTools(server, { principal, actor: actorOf(principal) }).pipe(
          Effect.map((tools): TargetTools => ({
            target,
            source: "listing",
            tools: tools.filter((tool) => only === undefined || tool.name === only).map((tool) => fromListing(server, tool))
          })),
          Effect.catchTag("UpstreamFailure", () => Effect.succeed(fallback(target, server)))
        )

      const forTarget = (principal: Principal, target: TargetMatch): Effect.Effect<TargetTools> => {
        const config = target.resource.config
        if (config.kind === "integration") {
          const piece = catalog.piece(config.pieceId)
          if (Option.isNone(piece)) return Effect.succeed({ target, source: "none", tools: [] })
          const actions = piece.value.actions.filter((action) => isSupported(action) && (config.actions === undefined || config.actions.includes(action.name)))
          return Effect.succeed({ target, source: "catalog", tools: actions.map((action) => fromAction(target.resource, action)) })
        }
        if (config.kind === "mcp_server") return listed(principal, target, target.resource)
        if (config.kind === "tool") {
          return resources.find(target.resource.orgId, config.serverId).pipe(
            Effect.flatMap(Option.match({
              onNone: () => Effect.succeed<TargetTools>({ target, source: "none", tools: [] }),
              onSome: (server) => listed(principal, target, server, config.toolName)
            }))
          )
        }
        return Effect.succeed({ target, source: "none", tools: [] })
      }

      return GuardToolDocs.of({
        forTargets: Effect.fn("GuardToolDocs.forTargets")(function*(principal: Principal, targets: ReadonlyArray<TargetMatch>) {
          return yield* Effect.forEach(targets.slice(0, 6), (target) => forTarget(principal, target), { concurrency: 4 })
        })
      })
    })
  )
}

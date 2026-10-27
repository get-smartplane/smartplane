import { DefaultToolSearchThreshold, type OrgId, ToolSearchThreshold } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { OrgsRepo } from "../../org/orgs-repo"

/** Per-request override of the org's threshold, for power users and CI: `all` lists everything, `search` never does. */
export const ToolsHeader = "x-smartplane-tools"
export const ToolsMode = Schema.Literals(["all", "search"])
export type ToolsMode = typeof ToolsMode.Type

export const decodeToolsMode = Schema.decodeUnknownOption(ToolsMode)

/** Search mode when the header asks for it, or when the caller's catalog is longer than the org's threshold. */
export const usesSearch = (toolCount: number, threshold: ToolSearchThreshold, override: ToolsMode | undefined): boolean =>
  override === undefined ? threshold !== null && toolCount > threshold : override === "search"

/** The org's tool search threshold; read on `tools/list` only, which clients send on connect, not per call. */
export class ToolSearchSettings extends Context.Service<ToolSearchSettings, {
  readonly threshold: (orgId: OrgId) => Effect.Effect<ToolSearchThreshold>
}>()("api/mcp/ToolSearchSettings") {
  static readonly layer = Layer.effect(
    ToolSearchSettings,
    Effect.gen(function*() {
      const orgs = yield* OrgsRepo
      const threshold = Effect.fn("ToolSearchSettings.threshold")(function*(orgId: OrgId) {
        const org = yield* orgs.find(orgId)
        return Option.match(org, { onNone: () => DefaultToolSearchThreshold, onSome: (found) => found.toolSearchThreshold })
      })
      return ToolSearchSettings.of({ threshold })
    })
  )

  /** A fixed threshold, for tests. */
  static readonly fixed = (value: ToolSearchThreshold) => Layer.succeed(ToolSearchSettings, { threshold: () => Effect.succeed(value) })
}

import { accountModeOf, Forbidden, hasPermission, InvalidInput, NotFound, type Principal, type Resource, type ResourceId, type ResourceTools } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { AccessPolicy } from "../access/access-policy"
import type { EffectiveGrant } from "../access/resolution"
import { actorOf } from "../audit/actor"
import { requirePermission } from "../auth/permissions"
import { ConnectionsRepo } from "../connections/connections-repo"
import { toolSummaryOf } from "../mcp/tool-summary"
import { Upstream } from "../mcp/upstream"
import { ResourceVisibility } from "./resource-visibility"
import { ResourcesRepo } from "./resources-repo"

/** Every tool name the grants allow, or `all` when one of them lists none (an unrestricted grant). */
export const allowedTools = (grant: EffectiveGrant): ReadonlySet<string> | "all" =>
  grant.terms.some(({ conditions }) => conditions.tools === undefined)
    ? "all"
    : new Set(grant.terms.flatMap(({ conditions }) => conditions.tools ?? []))

/**
 * An MCP server's tools for the dashboard (the resource page and the grant dialog). Admins with
 * `resources:manage` see them all; anyone else needs a grant on the server and sees what their grants allow,
 * the same rule the gateway's `tools/list` follows. The listing is `Upstream`'s, cached five minutes.
 */
export class ResourceToolList extends Context.Service<ResourceToolList, {
  readonly list: (principal: Principal, id: ResourceId) => Effect.Effect<ResourceTools, Forbidden | NotFound | InvalidInput>
}>()("api/resources/ResourceToolList") {
  static readonly layer = Layer.effect(
    ResourceToolList,
    Effect.gen(function*() {
      const visibility = yield* ResourceVisibility
      const resources = yield* ResourcesRepo
      const policy = yield* AccessPolicy
      const connections = yield* ConnectionsRepo
      const upstream = yield* Upstream

      const allowedFor = (principal: Principal, id: ResourceId) =>
        Effect.gen(function*() {
          if (hasPermission(principal, "resources:manage")) return "all" as const
          const grant = (yield* policy.resolve(principal)).get(id)
          if (grant === undefined) return yield* new Forbidden({ message: "you have no grant on this server" })
          return allowedTools(grant)
        })

      /** Whether an account exists to list with; without one the listing would only fail upstream. */
      const hasAccount = (resource: Resource, principal: Principal) =>
        Effect.gen(function*() {
          const config = resource.config
          if (config.kind !== "mcp_server" || config.auth === undefined || config.auth.type === "none") return true
          const perUser = accountModeOf(config) === "per_user"
          if (!perUser && config.auth.type === "secret") return true
          if (perUser && principal._tag !== "User") return false
          const owner = perUser && principal._tag === "User" ? principal.userId : null
          return Option.isSome(yield* connections.find(resource.orgId, resource.id, owner))
        })

      const list = Effect.fn("ResourceToolList.list")(function*(principal: Principal, id: ResourceId) {
        yield* requirePermission(principal, "resources:read")
        // NotFound for anything the caller may not see, before a grant is even looked at.
        yield* visibility.find(principal, id)
        const allowed = yield* allowedFor(principal, id)
        const resource = yield* resources.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "resource", id })))
        if (resource.config.kind !== "mcp_server") return yield* new InvalidInput({ message: `${resource.name} is not an MCP server`, field: "id" })
        if (!(yield* hasAccount(resource, principal))) {
          const empty: ResourceTools = { resourceId: id, status: "not_connected", tools: [] }
          return empty
        }
        const listed = yield* Effect.result(upstream.listTools(resource, { principal, actor: actorOf(principal) }))
        if (listed._tag === "Failure") {
          const failed: ResourceTools = { resourceId: id, status: "unavailable", message: listed.failure.message, tools: [] }
          return failed
        }
        const tools = listed.success.filter((tool) => allowed === "all" || allowed.has(tool.name)).map(toolSummaryOf)
        const available: ResourceTools = { resourceId: id, status: "available", tools }
        return available
      })

      return ResourceToolList.of({ list })
    })
  )
}

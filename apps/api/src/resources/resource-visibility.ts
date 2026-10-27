import { NotFound, type Principal, type Resource, type ResourceId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { ResourcesRepo } from "./resources-repo"
import { canSee, grantedVisibility, permissionVisibility, present, receivableSecrets, type Visibility, visibleOnly } from "./visibility"

/**
 * The one place that decides which resources a principal may see outside the gateway. Grant-based views
 * reuse `AccessPolicy` (the gateway's resolution), so the dashboard never shows more than an agent could use.
 */
export class ResourceVisibility extends Context.Service<ResourceVisibility, {
  readonly of: (principal: Principal) => Effect.Effect<Visibility>
  readonly filter: (principal: Principal, resources: ReadonlyArray<Resource>) => Effect.Effect<ReadonlyArray<Resource>>
  /** A resource the principal cannot see is NotFound, never Forbidden, so its existence is not confirmed. */
  readonly find: (principal: Principal, id: ResourceId) => Effect.Effect<Resource, NotFound>
  readonly visibleIds: (principal: Principal, ids: ReadonlyArray<ResourceId>) => Effect.Effect<ReadonlySet<ResourceId>>
}>()("api/resources/ResourceVisibility") {
  static readonly layer = Layer.effect(
    ResourceVisibility,
    Effect.gen(function*() {
      const policy = yield* AccessPolicy
      const repo = yield* ResourcesRepo

      const of = Effect.fn("ResourceVisibility.of")(function*(principal: Principal) {
        const byPermission = permissionVisibility(principal)
        if (byPermission === "Everything") return { _tag: "Everything" } satisfies Visibility
        const access = yield* policy.resolve(principal)
        if (byPermission === "Catalogue") return { _tag: "Catalogue", secrets: receivableSecrets(access) } satisfies Visibility
        const grantsServer = Array.from(access.values()).some(({ resource }) => resource.config.kind === "mcp_server")
        const tools = grantsServer ? yield* repo.ofKind(principal.orgId, "tool") : []
        return grantedVisibility(principal, access, tools)
      })

      const notFound = (id: ResourceId) => new NotFound({ entity: "resource", id })

      return ResourceVisibility.of({
        of,
        filter: Effect.fn("ResourceVisibility.filter")(function*(principal: Principal, resources: ReadonlyArray<Resource>) {
          return visibleOnly(yield* of(principal), resources)
        }),
        find: Effect.fn("ResourceVisibility.find")(function*(principal: Principal, id: ResourceId) {
          const found = yield* repo.find(principal.orgId, id)
          if (Option.isNone(found)) return yield* notFound(id)
          const visibility = yield* of(principal)
          if (!canSee(visibility, found.value)) return yield* notFound(id)
          return present(visibility, found.value)
        }),
        visibleIds: Effect.fn("ResourceVisibility.visibleIds")(function*(principal: Principal, ids: ReadonlyArray<ResourceId>) {
          const visibility = yield* of(principal)
          if (visibility._tag === "Everything") return new Set(ids)
          const found = yield* repo.findMany(principal.orgId, ids)
          return new Set(found.filter((resource) => canSee(visibility, resource)).map((resource) => resource.id))
        })
      })
    })
  )
}

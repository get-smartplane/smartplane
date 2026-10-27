import type { Principal } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { ResourcesRepo } from "../resources/resources-repo"
import { GrantsRepo } from "./grants-repo"
import { type EffectiveAccess, resolveAccess } from "./resolution"
import { subjectsOf } from "./subjects"

/** Loads a principal's grants and resolves them into effective, per-resource access. */
export class AccessPolicy extends Context.Service<AccessPolicy, {
  readonly resolve: (principal: Principal) => Effect.Effect<EffectiveAccess>
}>()("api/access/AccessPolicy") {
  static readonly layer = Layer.effect(
    AccessPolicy,
    Effect.gen(function*() {
      const grants = yield* GrantsRepo
      const resources = yield* ResourcesRepo
      return AccessPolicy.of({
        resolve: Effect.fn("AccessPolicy.resolve")(function*(principal: Principal) {
          const candidates = yield* grants.forSubjects(principal.orgId, subjectsOf(principal))
          const targets = yield* resources.findMany(principal.orgId, [...new Set(candidates.map((grant) => grant.resourceId))])
          const access = resolveAccess(principal, candidates, targets, yield* DateTime.now)
          yield* Effect.annotateCurrentSpan({ "access.grants": candidates.length, "access.resources": access.size })
          return access
        })
      })
    })
  )
}

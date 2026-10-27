import { type Forbidden, hasPermission, type Principal, type SecretStatus } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { requirePermission } from "../auth/permissions"
import { ResourceVisibility } from "../resources/resource-visibility"
import { SecretVersionsRepo } from "./versions-repo"

/** Secret metadata for the dashboard's Secrets page: versions and their times, never values or key material. */
export class SecretStatuses extends Context.Service<SecretStatuses, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<SecretStatus>, Forbidden>
}>()("api/secrets/SecretStatuses") {
  static readonly layer = Layer.effect(
    SecretStatuses,
    Effect.gen(function*() {
      const versions = yield* SecretVersionsRepo
      const visibility = yield* ResourceVisibility
      return SecretStatuses.of({
        // Managers see every secret; others only the ones visibility shows them (deliverable secrets they may
        // receive, see resources/visibility.ts), so "last rotated" is never shown for a hidden secret.
        list: Effect.fn("SecretStatuses.list")(function*(principal: Principal) {
          yield* requirePermission(principal, "resources:read")
          const statuses = yield* versions.statuses(principal.orgId)
          if (hasPermission(principal, "resources:manage")) return statuses
          const visible = yield* visibility.visibleIds(principal, statuses.map((status) => status.resourceId))
          return statuses.filter((status) => visible.has(status.resourceId))
        })
      })
    })
  )
}

import { Conflict, deliverability, envNameOf, type Resource } from "@pc/domain"
import { Effect } from "effect"
import { ResourcesRepo } from "../resources/resources-repo"

/**
 * Another deliverable secret or variable of the same org and project (org-wide counts as its own scope)
 * that would be delivered under the same env name, if any. A project resource may reuse an org-wide name:
 * it overrides it for that project (see `planDelivery`).
 */
export const envNameClash = (resource: Resource, others: ReadonlyArray<Resource>): Resource | undefined => {
  const name = envNameOf(resource)
  if (name === undefined || deliverability(resource.config) !== "deliverable") return undefined
  return others.find((other) =>
    other.id !== resource.id && other.projectId === resource.projectId &&
    deliverability(other.config) === "deliverable" && envNameOf(other) === name
  )
}

/** Fails with Conflict when `resource`, as it is about to be saved, would share its env name in its scope. */
export const checkEnvNameUnique = Effect.fn("checkEnvNameUnique")(function*(resource: Resource) {
  if (resource.config.kind !== "secret" && resource.config.kind !== "variable") return
  const repo = yield* ResourcesRepo
  const others = [...(yield* repo.ofKind(resource.orgId, "secret")), ...(yield* repo.ofKind(resource.orgId, "variable"))]
  const clash = envNameClash(resource, others)
  if (clash !== undefined) {
    // The other resource is not named: the caller may not be allowed to see it.
    return yield* new Conflict({ message: `${envNameOf(resource)} is already delivered by another secret or variable in this scope; set a different envName` })
  }
})

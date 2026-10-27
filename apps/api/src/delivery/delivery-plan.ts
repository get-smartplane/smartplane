import { deliverability, type DeliveryDenial, type DeliveryDenialReason, type EnvName, envNameOf, type ProjectId, type Resource, type ResourceId } from "@pc/domain"

/** What the caller is entitled to, decided by the caller's kind (grants for members, the allow-list for machines). */
export interface Entitlement {
  /** May receive the value, if it is deliverable. */
  readonly receives: (resource: Resource) => boolean
  /** May know the resource exists (a grant of any level, or a permission that shows it); otherwise it is `unknown`. */
  readonly knows: (resource: Resource) => boolean
}

export interface DeliveryPlan {
  readonly deliver: ReadonlyArray<{ readonly name: EnvName; readonly resource: Resource }>
  readonly denied: ReadonlyArray<DeliveryDenial>
}

/** A project's own resource overrides an org-wide one of the same name; ties go to the lowest id, deterministically. */
const precedence = (a: Resource, b: Resource): number =>
  (a.projectId === null ? 1 : 0) - (b.projectId === null ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Decides, without I/O, which secrets and variables a request gets. `inScope` holds the live secrets and
 * variables of the request's scope. Each env name means one resource (the winner by `precedence`) and the
 * caller gets it only if entitled and it is deliverable. Denials are reported only for `requested` names,
 * so a request for everything never reveals what else exists.
 */
export const planDelivery = (
  inScope: ReadonlyArray<Resource>,
  entitlement: Entitlement,
  requested: ReadonlyArray<EnvName> | undefined
): DeliveryPlan => {
  const byName = new Map<EnvName, Resource>()
  for (const resource of [...inScope].sort(precedence)) {
    const name = envNameOf(resource)
    if (name !== undefined && !byName.has(name)) byName.set(name, resource)
  }
  const names = requested === undefined ? [...byName.keys()].sort() : [...new Set(requested)]
  const deliver: Array<DeliveryPlan["deliver"][number]> = []
  const denied: Array<DeliveryDenial> = []
  const deny = (name: string, reason: DeliveryDenialReason) => {
    if (requested !== undefined) denied.push({ name, reason })
  }
  for (const name of names) {
    const resource = byName.get(name)
    if (resource === undefined) deny(name, "unknown")
    else if (!entitlement.receives(resource)) deny(name, entitlement.knows(resource) ? "no_grant" : "unknown")
    else if (deliverability(resource.config) !== "deliverable") deny(name, "not_deliverable")
    else deliver.push({ name, resource })
  }
  return { deliver, denied }
}

/** Org-wide resources plus `projectId`'s (none but org-wide when null). */
export const inProjectScope = (resources: ReadonlyArray<Resource>, projectId: ProjectId | null): ReadonlyArray<Resource> =>
  resources.filter((resource) => resource.projectId === null || resource.projectId === projectId)

/** Live secrets and variables named in `ids`, whatever their project (a machine token's allow-list is its scope). */
export const listed = (resources: ReadonlyArray<Resource>, ids: ReadonlySet<ResourceId>): ReadonlyArray<Resource> =>
  resources.filter((resource) => ids.has(resource.id))

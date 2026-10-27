import type { Guard, ResourceId } from "@pc/domain"

/**
 * Guards as a member without `guards:manage` or `resources:manage` sees them. Org-wide guards (no resource
 * ids) stay as they are; a resource-scoped guard keeps only the resources the member can see, and is left
 * out when none remain, so guard listings never reveal resources hidden from them.
 */
export const visibleGuards = (guards: ReadonlyArray<Guard>, visible: ReadonlySet<ResourceId>): ReadonlyArray<Guard> =>
  guards.flatMap((guard) => {
    if (guard.resourceIds.length === 0) return [guard]
    const resourceIds = guard.resourceIds.filter((id) => visible.has(id))
    return resourceIds.length === 0 ? [] : [{ ...guard, resourceIds }]
  })

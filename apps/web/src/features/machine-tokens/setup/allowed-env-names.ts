import { deliverability, envNameOf, type Resource, type ResourceId } from "@pc/domain"

/**
 * The env names a new token can fetch, for the honest note under the agent prompt. Only entries still
 * deliverable count: the rest are excluded at delivery time, so naming them would overstate the reach.
 */
export const allowedEnvNames = (ids: ReadonlyArray<ResourceId>, resources: ReadonlyArray<Resource>): ReadonlyArray<string> => {
  const byId = new Map(resources.map((resource) => [resource.id, resource]))
  return ids.flatMap((id) => {
    const resource = byId.get(id)
    if (resource === undefined || deliverability(resource.config) !== "deliverable") return []
    return [envNameOf(resource) ?? resource.name]
  })
}

/** "A, B and C", or "the values it lists" before the resource list has loaded. */
export const listNames = (names: ReadonlyArray<string>): string => {
  if (names.length === 0) return "the values it lists"
  if (names.length === 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

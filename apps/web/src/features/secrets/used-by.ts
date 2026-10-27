import { type Resource, type ResourceId, secretReferences } from "@pc/domain"

/** For each secret, the live resources whose config references it (the API's own reference rules). */
export const usersOfSecrets = (resources: ReadonlyArray<Resource>): ReadonlyMap<ResourceId, ReadonlyArray<Resource>> => {
  const users = new Map<ResourceId, Array<Resource>>()
  for (const resource of resources) {
    for (const secretId of secretReferences(resource.config)) users.set(secretId, [...(users.get(secretId) ?? []), resource])
  }
  return users
}

import type { CreateResource, ResourceFilter, ResourceId, RotateSecret, UpdateResource } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const resourcesAtom = Atom.family((query: ResourceFilter) =>
  apiQuery(["resources"], (api) => api.resources.list({ query }))
)

/** Every resource, for name lookups and pickers. */
export const allResourcesAtom = resourcesAtom({})

/** Refreshes grants too: creating a usable resource also grants its creator admin on it. */
export const createResourceAtom = apiMutation(["resources", "grants"], (api, payload: CreateResource) =>
  api.resources.create({ payload })
)

/** Soft delete; the API also revokes every grant on the resource. */
export const removeResourceAtom = apiMutation(["resources", "grants"], (api, id: ResourceId) =>
  api.resources.remove({ params: { id } })
)

export const rotateSecretAtom = apiMutation(
  ["resources"],
  (api, { id, payload }: { readonly id: ResourceId; readonly payload: RotateSecret }) =>
    api.resources.rotateSecret({ params: { id }, payload })
)

export const updateResourceAtom = apiMutation(
  ["resources"],
  (api, { id, payload }: { readonly id: ResourceId; readonly payload: UpdateResource }) =>
    api.resources.update({ params: { id }, payload })
)

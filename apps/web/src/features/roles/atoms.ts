import type { CreateRole, RoleSlug, UpdateRole } from "@pc/domain"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const rolesAtom = apiQuery(["roles"], (api) => api.roles.list())

export const createRoleAtom = apiMutation(["roles"], (api, payload: CreateRole) => api.roles.create({ payload }))

export const updateRoleAtom = apiMutation(
  ["roles", "me"],
  (api, { slug, payload }: { readonly slug: RoleSlug; readonly payload: UpdateRole }) =>
    api.roles.update({ params: { slug }, payload })
)

export const removeRoleAtom = apiMutation(["roles"], (api, slug: RoleSlug) => api.roles.remove({ params: { slug } }))

import type { CreateGrant, GrantId } from "@pc/domain"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const grantsAtom = apiQuery(["grants"], (api) => api.grants.list({ query: {} }))

export const createGrantAtom = apiMutation(["grants"], (api, payload: CreateGrant) => api.grants.create({ payload }))

export const revokeGrantAtom = apiMutation(["grants"], (api, id: GrantId) => api.grants.revoke({ params: { id } }))

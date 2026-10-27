import type { CreateMachineToken, MachineTokenId } from "@pc/domain"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const machineTokensAtom = apiQuery(["machineTokens"], (api) => api.machineTokens.list())

export const createMachineTokenAtom = apiMutation(["machineTokens", "audit"], (api, payload: CreateMachineToken) =>
  api.machineTokens.create({ payload })
)

/** Renewing moves the expiry to `ttlDays` (default 90) from now; the token itself does not change. */
export const renewMachineTokenAtom = apiMutation(["machineTokens", "audit"], (api, id: MachineTokenId) =>
  api.machineTokens.renew({ params: { id }, payload: {} })
)

/** Access reviews list machine tokens, so a revoke refreshes them too. */
export const revokeMachineTokenAtom = apiMutation(["machineTokens", "reviews", "audit"], (api, id: MachineTokenId) =>
  api.machineTokens.revoke({ params: { id } })
)

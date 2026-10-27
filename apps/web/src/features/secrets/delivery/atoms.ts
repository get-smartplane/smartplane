import type { ResourceId, UpdateDelivery } from "@pc/domain"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

/** Per-resource `secret.delivered` counts and latest recipient; needs `audit:read`. */
export const deliveriesAtom = apiQuery(["resources", "audit"], (api) => api.audit.deliveries())

/** A change can take a secret off machine tokens' effective allow-lists, so those refresh too. */
export const updateDeliveryAtom = apiMutation(
  ["resources", "audit", "machineTokens"],
  (api, { id, payload }: { readonly id: ResourceId; readonly payload: UpdateDelivery }) => api.resourceDelivery.update({ params: { id }, payload })
)

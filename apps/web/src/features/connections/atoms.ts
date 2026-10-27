import type { AccountMode, ResourceId } from "@pc/domain"
import type { Redacted } from "effect"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

/** A resource's shared account, the caller's own, and whether they may manage it. */
export const resourceConnectionsAtom = Atom.family((id: ResourceId) => apiQuery(["connections"], (api) => api.connections.forResource({ params: { id } })))

/** The caller's per-user resources and their own account on each. */
export const myConnectionsAtom = apiQuery(["connections"], (api) => api.connections.mine())

/** Starting changes nothing until the provider calls back. */
export const startConnectionAtom = apiMutation([], (api, id: ResourceId) => api.connections.startOAuth({ params: { id } }))

export const connectSecretAtom = apiMutation(["connections"], (api, input: { readonly id: ResourceId; readonly value: Redacted.Redacted<string> }) =>
  api.connections.connectSecret({ params: { id: input.id }, payload: { value: input.value } })
)

/** Shared integrations reset their config on disconnect, so resources refresh too. */
export const disconnectAtom = apiMutation(["connections", "resources"], (api, id: ResourceId) => api.connections.disconnect({ params: { id } }))

export const setModeAtom = apiMutation(["connections", "resources"], (api, input: { readonly id: ResourceId; readonly mode: AccountMode }) =>
  api.connections.setMode({ params: { id: input.id }, payload: { mode: input.mode } })
)

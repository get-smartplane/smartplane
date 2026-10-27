import type { AddGuardTestCall, ConfirmGuardPin, CreateGuard, CreateGuardFromStarter, GuardId, GuardTestCase, UpdateGuard } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const guardsAtom = apiQuery(["guards"], (api) => api.guards.list())

export const createGuardAtom = apiMutation(["guards"], (api, payload: CreateGuard) => api.guards.create({ payload }))

/** A prepared rule: it comes back compiled, with its verify already done. */
export const createGuardFromStarterAtom = apiMutation(["guards"], (api, payload: CreateGuardFromStarter) => api.guards.createFromStarter({ payload }))

/** Starts a verify run; it answers at once and the run goes on in the background (`guard.verify`). */
export const compileGuardAtom = apiMutation(["guards"], (api, id: GuardId) => api.guards.compile({ params: { id } }))

export const cancelVerifyAtom = apiMutation(["guards"], (api, id: GuardId) => api.guards.cancelVerify({ params: { id } }))

/** Tests a run waiting for a pin confirmation without pinning anything. */
export const continueVerifyAtom = apiMutation(["guards"], (api, id: GuardId) => api.guards.continueVerify({ params: { id } }))

/** A dry run changes nothing, so it invalidates nothing. */
export const testGuardAtom = apiMutation(
  [],
  (api, { id, payload }: { readonly id: GuardId; readonly payload: GuardTestCase }) =>
    api.guards.test({ params: { id }, payload })
)

export const updateGuardAtom = apiMutation(
  ["guards"],
  (api, { id, payload }: { readonly id: GuardId; readonly payload: UpdateGuard }) =>
    api.guards.update({ params: { id }, payload })
)

export const addTestCallAtom = apiMutation(
  ["guards"],
  (api, { id, payload }: { readonly id: GuardId; readonly payload: AddGuardTestCall }) => api.guards.addTestCall({ params: { id }, payload })
)

export const removeTestCallAtom = apiMutation(
  ["guards"],
  (api, { id, callId }: { readonly id: GuardId; readonly callId: string }) => api.guards.removeTestCall({ params: { id, callId } })
)

/** Pins the candidate the admin picked; nothing is pinned without this. */
export const confirmPinAtom = apiMutation(
  ["guards"],
  (api, { id, payload }: { readonly id: GuardId; readonly payload: ConfirmGuardPin }) => api.guards.confirmPin({ params: { id }, payload })
)

/** "None of these": the rule stays semantic. */
export const dismissPinsAtom = apiMutation(["guards"], (api, id: GuardId) => api.guards.dismissPins({ params: { id } }))

export const unpinAtom = apiMutation(
  ["guards"],
  (api, { id, pinId }: { readonly id: GuardId; readonly pinId: string }) => api.guards.unpin({ params: { id, pinId } })
)

/** Per pin, how many items inside it the gateway has recognised. */
export const pinStatsAtom = Atom.family((id: GuardId) => apiQuery(["guards"], (api) => api.guards.pinStats({ params: { id } })))

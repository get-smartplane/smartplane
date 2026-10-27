import type { CreateSkill, ResourceId, SkillScanPolicy, UploadSkillQuery } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

/** Whether scanning is on for this deployment, which scanners run, and the org's policy. */
export const scanningAtom = apiQuery(["skills"], (api) => api.skills.scanning())

export const versionsAtom = Atom.family((id: ResourceId) => apiQuery(["skills"], (api) => api.skills.versions({ params: { id } })))

/** One version with its scan reports and whether agents can be served it right now. */
export const versionAtom = Atom.family((id: ResourceId) =>
  Atom.family((version: number) => apiQuery(["skills"], (api) => api.skills.version({ params: { id, version } })))
)

export const createSkillAtom = apiMutation(["resources", "skills", "grants"], (api, payload: CreateSkill) => api.skills.create({ payload }))

export const uploadSkillAtom = apiMutation(
  ["resources", "skills", "grants"],
  (api, { query, archive }: { readonly query: UploadSkillQuery; readonly archive: Uint8Array }) => api.skills.upload({ query, payload: archive })
)

/** Re-fetches a GitHub or link skill; the new version waits for activation unless it is the first. */
export const refetchSkillAtom = apiMutation(["skills", "resources"], (api, id: ResourceId) => api.skills.refetch({ params: { id } }))

export const uploadVersionAtom = apiMutation(
  ["skills", "resources"],
  (api, { id, filename, archive }: { readonly id: ResourceId; readonly filename: string; readonly archive: Uint8Array }) =>
    api.skills.uploadVersion({ params: { id }, query: { filename }, payload: archive })
)

/** On demand only: it asks GitHub, so it is a button, not a query that runs on every visit. */
export const checkUpdatesAtom = apiMutation([], (api, id: ResourceId) => api.skills.checkUpdates({ params: { id } }))

type VersionRef = { readonly id: ResourceId; readonly version: number }

export const activateVersionAtom = apiMutation(["skills", "resources"], (api, params: VersionRef) => api.skills.activate({ params }))

export const rescanVersionAtom = apiMutation(["skills"], (api, params: VersionRef) => api.skills.rescan({ params }))

export const overrideScanAtom = apiMutation(
  ["skills", "audit"],
  (api, { reason, ...params }: VersionRef & { readonly reason: string }) => api.skills.override({ params, payload: { reason } })
)

export const updateScanPolicyAtom = apiMutation(["skills", "audit"], (api, payload: SkillScanPolicy) => api.skills.updatePolicy({ payload }))

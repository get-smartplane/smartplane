import type { CreateTeam, TeamId, UserId } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const teamsAtom = apiQuery(["teams"], (api) => api.teams.list())

export const teamMembersAtom = Atom.family((id: TeamId) =>
  apiQuery(["teams"], (api) => api.teams.listMembers({ params: { id } }))
)

export const createTeamAtom = apiMutation(["teams"], (api, payload: CreateTeam) => api.teams.create({ payload }))

/** Removing a team also revokes the grants whose subject it was. */
export const removeTeamAtom = apiMutation(["teams", "grants"], (api, id: TeamId) => api.teams.remove({ params: { id } }))

export const addTeamMemberAtom = apiMutation(
  ["teams"],
  (api, { id, userId }: { readonly id: TeamId; readonly userId: UserId }) =>
    api.teams.addMember({ params: { id }, payload: { userId } })
)

export const removeTeamMemberAtom = apiMutation(
  ["teams"],
  (api, params: { readonly id: TeamId; readonly userId: UserId }) => api.teams.removeMember({ params })
)

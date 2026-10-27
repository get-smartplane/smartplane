import type { InviteAccess, InviteMember, InviteWithAccess, MembershipId, RoleSlug } from "@pc/domain"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const membersAtom = apiQuery(["members"], (api) => api.members.list())

export const inviteMemberAtom = apiMutation(["members"], (api, payload: InviteMember) => api.members.invite({ payload }))

/** Several people, one role, and the teams and grants they get when they accept. */
export const inviteWithAccessAtom = apiMutation(["members"], (api, payload: InviteWithAccess) => api.members.inviteWithAccess({ payload }))

export const pendingInvitesAtom = apiQuery(["members"], (api) => api.members.listInvites())

export const setInviteAccessAtom = apiMutation(
  ["members"],
  (api, { id, access }: { readonly id: MembershipId; readonly access: InviteAccess }) =>
    api.members.setInviteAccess({ params: { id }, payload: access })
)

export const changeMemberRoleAtom = apiMutation(
  ["members"],
  (api, { id, role }: { readonly id: MembershipId; readonly role: RoleSlug }) =>
    api.members.changeRole({ params: { id }, payload: { role } })
)

/** Offboarding touches tokens, grants and team memberships too, so all of them refresh. */
export const removeMemberAtom = apiMutation(["members", "tokens", "grants", "teams"], (api, id: MembershipId) =>
  api.members.remove({ params: { id } })
)

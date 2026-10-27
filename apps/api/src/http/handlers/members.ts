import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Invitations } from "../../org/invitations"
import { Members } from "../../org/members"

export const MembersHandlers = HttpApiBuilder.group(PrimitiveApi, "members", Effect.fn(function*(handlers) {
  const members = yield* Members
  const invitations = yield* Invitations
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => members.list(principal)))
    .handle("invite", ({ payload }) => CurrentPrincipal.use((principal) => members.invite(principal, payload)))
    .handle("inviteWithAccess", ({ payload }) => CurrentPrincipal.use((principal) => invitations.inviteWithAccess(principal, payload)))
    .handle("listInvites", () => CurrentPrincipal.use((principal) => invitations.listPending(principal)))
    .handle("setInviteAccess", ({ params, payload }) => CurrentPrincipal.use((principal) => invitations.setAccess(principal, params.id, payload)))
    .handle("changeRole", ({ params, payload }) => CurrentPrincipal.use((principal) => members.changeRole(principal, params.id, payload)))
    .handle("remove", ({ params }) => CurrentPrincipal.use((principal) => members.remove(principal, params.id)))
}))

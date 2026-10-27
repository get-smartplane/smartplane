import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Conflict, Forbidden, InvalidInput, NotFound, UpstreamFailure } from "../errors"
import { MembershipId } from "../ids"
import { InviteAccess, InviteWithAccess, PendingInvite } from "../org/invitation"
import { ChangeMemberRole, InviteMember, Member } from "../org/member"
import { Authentication } from "./security"

const params = { id: MembershipId }

export class MembersApi extends HttpApiGroup.make("members")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Member), error: Forbidden }),
    HttpApiEndpoint.post("invite", "/", {
      payload: InviteMember,
      success: Member.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, Conflict, InvalidInput, UpstreamFailure]
    }),
    /**
     * Invites several people with one role, team setup and direct grants. Everything is validated before any
     * invitation is sent; each person's membership and access setup are then written together. Teams and
     * grants apply when the invitation is accepted. Needs `teams:manage` for teams, `grants:manage` for grants.
     */
    HttpApiEndpoint.post("inviteWithAccess", "/invite-with-access", {
      payload: InviteWithAccess,
      success: Schema.Array(Member).pipe(HttpApiSchema.status(201)),
      error: [Forbidden, Conflict, InvalidInput, NotFound, UpstreamFailure]
    }),
    /** The access waiting on each pending invitation that has any. */
    HttpApiEndpoint.get("listInvites", "/invites", { success: Schema.Array(PendingInvite), error: Forbidden }),
    /** Replaces a pending invitation's access setup; an empty setup clears it. */
    HttpApiEndpoint.put("setInviteAccess", "/:id/access", {
      params,
      payload: InviteAccess,
      success: PendingInvite,
      error: [Forbidden, NotFound, Conflict, InvalidInput]
    }),
    HttpApiEndpoint.patch("changeRole", "/:id/role", {
      params,
      payload: ChangeMemberRole,
      success: Member,
      error: [Forbidden, NotFound, Conflict, InvalidInput]
    }),
    /** Runs the single offboarding path: membership, tokens, direct grants and team memberships. */
    HttpApiEndpoint.delete("remove", "/:id", {
      params,
      success: Member,
      error: [Forbidden, NotFound, Conflict, InvalidInput]
    })
  )
  .middleware(Authentication)
  .prefix("/members")
{}

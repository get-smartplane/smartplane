import { Schema } from "effect"
import { GrantConditions } from "../access/grant"
import { MembershipId, ResourceId, RoleSlug, TeamId, UserId } from "../ids"
import { Email, Timestamp } from "../primitives"
import { Action } from "../rbac"

/** A grant to the invited person, made for them when they accept. The subject is always that person. */
export const InviteGrant = Schema.Struct({
  resourceId: ResourceId,
  action: Action,
  conditions: GrantConditions,
  expiresAt: Schema.NullOr(Timestamp)
}).annotate({ identifier: "InviteGrant" })
export type InviteGrant = typeof InviteGrant.Type

const distinctTeams = Schema.makeFilter((ids: ReadonlyArray<string>) =>
  new Set(ids).size === ids.length ? undefined : "each team can be listed once"
)

/**
 * Access an invitation carries. Invited people have no user yet, so nothing is granted or joined until they
 * accept; then the teams and grants apply in one step, and offboarding the invitation drops them.
 * Projects have no members: a person reaches a project's resources through grants like these.
 */
export const InviteAccess = Schema.Struct({
  teamIds: Schema.Array(TeamId).check(Schema.isMaxLength(50), distinctTeams),
  grants: Schema.Array(InviteGrant).check(Schema.isMaxLength(100))
}).annotate({ identifier: "InviteAccess" })
export type InviteAccess = typeof InviteAccess.Type

export const noInviteAccess: InviteAccess = { teamIds: [], grants: [] }

const distinctEmails = Schema.makeFilter((emails: ReadonlyArray<string>) =>
  new Set(emails.map((email) => email.toLowerCase())).size === emails.length ? undefined : "each email can be listed once"
)

/** Several people, one role, one access setup. Ownership can only be handed out by owners. */
export const InviteWithAccess = Schema.Struct({
  emails: Schema.NonEmptyArray(Email).check(Schema.isMaxLength(50), distinctEmails),
  role: RoleSlug,
  access: InviteAccess
}).annotate({ identifier: "InviteWithAccess" })
export type InviteWithAccess = typeof InviteWithAccess.Type

/** The access waiting on an invitation; `setBy` is who authorized it, recorded on the grants it becomes. */
export class PendingInvite extends Schema.Opaque<PendingInvite>()(
  Schema.Struct({
    membershipId: MembershipId,
    access: InviteAccess,
    setBy: UserId,
    updatedAt: Timestamp
  }).annotate({ identifier: "PendingInvite" })
) {}

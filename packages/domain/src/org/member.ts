import { Schema } from "effect"
import { MembershipId, OrgId, RoleSlug, UserId } from "../ids"
import { Email, Timestamp } from "../primitives"

export const MemberStatus = Schema.Literals(["active", "invited", "deprovisioned"])
export type MemberStatus = typeof MemberStatus.Type

/** How the membership was created. Directory-managed (`scim`) members cannot be edited by hand. */
export const MemberSource = Schema.Literals(["manual", "workos", "scim"])
export type MemberSource = typeof MemberSource.Type

/** Deprovisioned members are kept, never deleted, so the audit trail keeps resolving. */
export class Member extends Schema.Opaque<Member>()(
  Schema.Struct({
    id: MembershipId,
    orgId: OrgId,
    /** `null` while an invitation has not been accepted. */
    userId: Schema.NullOr(UserId),
    email: Email,
    name: Schema.NullOr(Schema.String),
    role: RoleSlug,
    status: MemberStatus,
    source: MemberSource,
    lastSeenAt: Schema.NullOr(Timestamp),
    createdAt: Timestamp,
    deprovisionedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "Member" })
) {}

export const InviteMember = Schema.Struct({
  email: Email,
  role: RoleSlug
}).annotate({ identifier: "InviteMember" })
export type InviteMember = typeof InviteMember.Type

export const ChangeMemberRole = Schema.Struct({
  role: RoleSlug
}).annotate({ identifier: "ChangeMemberRole" })
export type ChangeMemberRole = typeof ChangeMemberRole.Type

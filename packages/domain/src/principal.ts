import { Context, Schema } from "effect"
import { AccessTokenId, MembershipId, OrgId, ProjectId, RoleSlug, TeamId, UserId } from "./ids"
import { Email, Name } from "./primitives"
import { OrgPermission } from "./rbac"

const scope = {
  orgId: OrgId,
  role: RoleSlug,
  /** Resolved from the role at authentication time. */
  permissions: Schema.Array(OrgPermission),
  teamIds: Schema.Array(TeamId),
  /** Set for project-scoped tokens: only that project's resources are visible. */
  projectId: Schema.NullOr(ProjectId)
}

/** The authenticated caller of an org-scoped endpoint: a dashboard user or an MCP client token. */
export const Principal = Schema.TaggedUnion({
  /** `tokenId` is set when a user acts through a personal access token instead of a session. */
  User: { ...scope, userId: UserId, membershipId: MembershipId, email: Email, tokenId: Schema.NullOr(AccessTokenId) },
  ServiceAccount: { ...scope, tokenId: AccessTokenId, name: Name }
}).annotate({ identifier: "Principal" })
export type Principal = typeof Principal.Type

export const hasPermission = (principal: Principal, permission: OrgPermission): boolean =>
  principal.permissions.includes(permission)

export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal>()("@pc/domain/CurrentPrincipal") {}

/** A signed-in user who may not belong to an org yet (onboarding). */
export const SessionUser = Schema.Struct({
  userId: UserId,
  email: Email,
  name: Schema.NullOr(Schema.String)
}).annotate({ identifier: "SessionUser" })
export type SessionUser = typeof SessionUser.Type

export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("@pc/domain/CurrentUser") {}

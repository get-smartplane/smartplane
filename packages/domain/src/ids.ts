import { Schema } from "effect"

/**
 * Id prefixes, keyed by brand. apps/api generates ids with these prefixes; the schemas below
 * reject ids from the wrong table so a TeamId can never be passed where a UserId is expected.
 */
export const IdPrefix = {
  OrgId: "org",
  UserId: "usr",
  MembershipId: "mem",
  TeamId: "team",
  ProjectId: "prj",
  ResourceId: "res",
  GrantId: "grt",
  GuardId: "grd",
  ApprovalId: "apr",
  AccessTokenId: "tok",
  AuditEventId: "evt",
  AccessReviewId: "arv",
  AccessReviewItemId: "ari",
  SkillVersionId: "skv",
  ConnectionId: "con",
  MachineTokenId: "mtk"
} as const

const prefixed = (prefix: string) => Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}_[0-9A-Za-z]{8,64}$`)))

export const OrgId = prefixed(IdPrefix.OrgId).pipe(Schema.brand("OrgId"))
export type OrgId = typeof OrgId.Type

export const UserId = prefixed(IdPrefix.UserId).pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const MembershipId = prefixed(IdPrefix.MembershipId).pipe(Schema.brand("MembershipId"))
export type MembershipId = typeof MembershipId.Type

export const TeamId = prefixed(IdPrefix.TeamId).pipe(Schema.brand("TeamId"))
export type TeamId = typeof TeamId.Type

export const ProjectId = prefixed(IdPrefix.ProjectId).pipe(Schema.brand("ProjectId"))
export type ProjectId = typeof ProjectId.Type

export const ResourceId = prefixed(IdPrefix.ResourceId).pipe(Schema.brand("ResourceId"))
export type ResourceId = typeof ResourceId.Type

export const GrantId = prefixed(IdPrefix.GrantId).pipe(Schema.brand("GrantId"))
export type GrantId = typeof GrantId.Type

export const GuardId = prefixed(IdPrefix.GuardId).pipe(Schema.brand("GuardId"))
export type GuardId = typeof GuardId.Type

export const ApprovalId = prefixed(IdPrefix.ApprovalId).pipe(Schema.brand("ApprovalId"))
export type ApprovalId = typeof ApprovalId.Type

export const AccessTokenId = prefixed(IdPrefix.AccessTokenId).pipe(Schema.brand("AccessTokenId"))
export type AccessTokenId = typeof AccessTokenId.Type

export const AuditEventId = prefixed(IdPrefix.AuditEventId).pipe(Schema.brand("AuditEventId"))
export type AuditEventId = typeof AuditEventId.Type

export const AccessReviewId = prefixed(IdPrefix.AccessReviewId).pipe(Schema.brand("AccessReviewId"))
export type AccessReviewId = typeof AccessReviewId.Type

export const AccessReviewItemId = prefixed(IdPrefix.AccessReviewItemId).pipe(Schema.brand("AccessReviewItemId"))
export type AccessReviewItemId = typeof AccessReviewItemId.Type

export const SkillVersionId = prefixed(IdPrefix.SkillVersionId).pipe(Schema.brand("SkillVersionId"))
export type SkillVersionId = typeof SkillVersionId.Type

export const ConnectionId = prefixed(IdPrefix.ConnectionId).pipe(Schema.brand("ConnectionId"))
export type ConnectionId = typeof ConnectionId.Type

export const MachineTokenId = prefixed(IdPrefix.MachineTokenId).pipe(Schema.brand("MachineTokenId"))
export type MachineTokenId = typeof MachineTokenId.Type

/** Roles are addressed by slug: builtin (`owner`, `admin`, ...) or custom per org. */
export const RoleSlug = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{1,47}$/)).pipe(Schema.brand("RoleSlug"))
export type RoleSlug = typeof RoleSlug.Type

/** Entity names used by NotFound errors and audit targets. */
export const EntityKind = Schema.Literals([
  "org",
  "user",
  "member",
  "role",
  "team",
  "project",
  "resource",
  "grant",
  "guard",
  "approval",
  "token",
  "audit_event",
  "access_review",
  "access_review_item",
  "integration_piece",
  "connection",
  "mcp_catalog_entry"
])
export type EntityKind = typeof EntityKind.Type

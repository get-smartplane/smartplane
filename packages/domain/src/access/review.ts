import { Schema } from "effect"
import {
  AccessReviewId,
  AccessReviewItemId,
  GrantId,
  MachineTokenId,
  MembershipId,
  OrgId,
  ProjectId,
  ResourceId,
  RoleSlug,
  UserId
} from "../ids"
import { Email, Name, Timestamp } from "../primitives"
import { Action } from "../rbac"
import { GrantConditions, GrantSubject } from "./grant"

/** What a campaign covers: every membership and grant of the org, or the grants on one project's resources. */
export const AccessReviewScope = Schema.Union([
  Schema.Struct({ type: Schema.tag("org") }),
  Schema.Struct({ type: Schema.tag("project"), projectId: ProjectId })
]).annotate({ identifier: "AccessReviewScope" })
export type AccessReviewScope = typeof AccessReviewScope.Type

export const AccessReviewStatus = Schema.Literals(["open", "closed"])
export type AccessReviewStatus = typeof AccessReviewStatus.Type

/** A periodic user access review (SOC 2 CC6.2/CC6.3). Items are a snapshot taken when it was created. */
export class AccessReview extends Schema.Opaque<AccessReview>()(
  Schema.Struct({
    id: AccessReviewId,
    orgId: OrgId,
    name: Name,
    scope: AccessReviewScope,
    status: AccessReviewStatus,
    dueAt: Schema.NullOr(Timestamp),
    createdBy: UserId,
    createdAt: Timestamp,
    closedBy: Schema.NullOr(UserId),
    closedAt: Schema.NullOr(Timestamp),
    itemCount: Schema.Int,
    decidedCount: Schema.Int
  }).annotate({ identifier: "AccessReview" })
) {}

/** The access under review, as it was at snapshot time. */
export const ReviewedAccess = Schema.TaggedUnion({
  Membership: { membershipId: MembershipId, userId: Schema.NullOr(UserId), email: Email, role: RoleSlug },
  Grant: {
    grantId: GrantId,
    subject: GrantSubject,
    resourceId: ResourceId,
    action: Action,
    conditions: GrantConditions,
    expiresAt: Schema.NullOr(Timestamp)
  }
}).annotate({ identifier: "ReviewedAccess" })
export type ReviewedAccess = typeof ReviewedAccess.Type

export const ReviewDecision = Schema.Literals(["keep", "revoke"])
export type ReviewDecision = typeof ReviewDecision.Type

/**
 * One attestation. `beneficiaries` are the users who hold this access (directly, through a team or role, or
 * as the creator of a service account); none of them may decide the item (separation of duties).
 * Decisions are final; `appliedAt` is set once a revoke decision has taken effect.
 */
export class AccessReviewItem extends Schema.Opaque<AccessReviewItem>()(
  Schema.Struct({
    id: AccessReviewItemId,
    reviewId: AccessReviewId,
    access: ReviewedAccess,
    beneficiaries: Schema.Array(UserId),
    decision: Schema.NullOr(ReviewDecision),
    decidedBy: Schema.NullOr(UserId),
    decidedAt: Schema.NullOr(Timestamp),
    comment: Schema.NullOr(Schema.String),
    appliedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "AccessReviewItem" })
) {}

/**
 * A machine token as it was when the campaign was created. Machine tokens outlive their creator's
 * membership, so every org-wide campaign lists them (project campaigns: those of that project) with creator
 * and allow-list; a reviewer revokes one with `DELETE /api/machine-tokens/:id` (`reviews:manage` suffices).
 */
export const ReviewedMachineToken = Schema.Struct({
  machineTokenId: MachineTokenId,
  name: Name,
  createdBy: UserId,
  projectId: Schema.NullOr(ProjectId),
  allow: Schema.Array(ResourceId),
  expiresAt: Timestamp,
  lastUsedAt: Schema.NullOr(Timestamp)
}).annotate({ identifier: "ReviewedMachineToken" })
export type ReviewedMachineToken = typeof ReviewedMachineToken.Type

export class AccessReviewDetail extends Schema.Opaque<AccessReviewDetail>()(
  Schema.Struct({
    review: AccessReview,
    items: Schema.Array(AccessReviewItem),
    machineTokens: Schema.Array(ReviewedMachineToken)
  }).annotate({ identifier: "AccessReviewDetail" })
) {}

export const CreateAccessReview = Schema.Struct({
  name: Name,
  scope: AccessReviewScope,
  dueAt: Schema.NullOr(Timestamp)
}).annotate({ identifier: "CreateAccessReview" })
export type CreateAccessReview = typeof CreateAccessReview.Type

/** `revoke` takes effect immediately: the grant is revoked, or the member is offboarded. */
export const DecideReviewItem = Schema.Struct({
  decision: ReviewDecision,
  comment: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2000)))
}).annotate({ identifier: "DecideReviewItem" })
export type DecideReviewItem = typeof DecideReviewItem.Type

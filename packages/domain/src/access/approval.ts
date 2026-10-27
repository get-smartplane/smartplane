import { Schema } from "effect"
import { Actor } from "../audit/actor"
import { ApprovalId, GuardId, OrgId, ResourceId, UserId } from "../ids"
import { Timestamp } from "../primitives"

/** `consumed`: an approval allows one call; the call that uses it moves it from `approved`. */
export const ApprovalStatus = Schema.Literals(["pending", "approved", "rejected", "expired", "consumed"])
export type ApprovalStatus = typeof ApprovalStatus.Type

/** The agent action held back by a `require_approval` guard. */
export const ApprovalRequest = Schema.Struct({
  resourceId: ResourceId,
  tool: Schema.NonEmptyString,
  arguments: Schema.Unknown
}).annotate({ identifier: "ApprovalRequest" })
export type ApprovalRequest = typeof ApprovalRequest.Type

export class Approval extends Schema.Opaque<Approval>()(
  Schema.Struct({
    id: ApprovalId,
    orgId: OrgId,
    guardId: GuardId,
    requestedBy: Actor,
    request: ApprovalRequest,
    status: ApprovalStatus,
    decidedBy: Schema.NullOr(UserId),
    decidedAt: Schema.NullOr(Timestamp),
    comment: Schema.NullOr(Schema.String),
    createdAt: Timestamp,
    expiresAt: Timestamp
  }).annotate({ identifier: "Approval" })
) {}

/** Separation of duties: deciding your own request is Forbidden. */
export const DecideApproval = Schema.Struct({
  decision: ApprovalStatus.pick(["approved", "rejected"]),
  comment: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2000)))
}).annotate({ identifier: "DecideApproval" })
export type DecideApproval = typeof DecideApproval.Type

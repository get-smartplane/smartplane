import { Schema } from "effect"
import { ApprovalId, GuardId, ResourceId } from "../ids"
import { Probability } from "../primitives"
import { Action } from "../rbac"

/** Why an action was refused. Grants are additive; only guards can deny what a grant allows. */
export const DenyReason = Schema.TaggedUnion({
  /** The name matches no tool the principal is offered, so there is no resource to check grants against. */
  UnknownTool: { tool: Schema.String },
  /** The prompt name or `skill://` URI matches no skill the principal may read. */
  UnknownSkill: { name: Schema.String },
  NoGrant: { resourceId: ResourceId },
  ActionNotGranted: { resourceId: ResourceId, required: Action },
  ToolNotAllowed: { resourceId: ResourceId, tool: Schema.String },
  /** The tool is granted, but only for other values of the argument at `path`. */
  ArgumentNotAllowed: { resourceId: ResourceId, tool: Schema.String, path: Schema.String },
  GuardViolation: { guardId: GuardId, probability: Probability },
  /** Guards fail closed: an enforcing guard that cannot be evaluated denies. */
  GuardUnavailable: { guardId: GuardId },
  /** Granted, but the account the call needs is not connected (per-user, or a shared OAuth account nobody connected). */
  NotConnected: { resourceId: ResourceId }
}).annotate({ identifier: "DenyReason" })
export type DenyReason = typeof DenyReason.Type

/** Outcome of evaluating grants and guards for one agent action. */
export const Decision = Schema.TaggedUnion({
  /** `flaggedBy`: monitor-mode guards that would have blocked; recorded, not enforced. */
  Allow: { flaggedBy: Schema.Array(GuardId) },
  Deny: { reasons: Schema.NonEmptyArray(DenyReason) },
  PendingApproval: { approvalId: ApprovalId, guardId: GuardId }
}).annotate({ identifier: "Decision" })
export type Decision = typeof Decision.Type

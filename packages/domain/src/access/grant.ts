import { Schema } from "effect"
import { AccessTokenId, GrantId, OrgId, ResourceId, RoleSlug, TeamId, UserId } from "../ids"
import { Timestamp } from "../primitives"
import { Action } from "../rbac"

/** Who a grant is for. The `type` values are exactly `SubjectType`. */
export const GrantSubject = Schema.Union([
  Schema.Struct({ type: Schema.tag("user"), id: UserId }),
  Schema.Struct({ type: Schema.tag("team"), id: TeamId }),
  Schema.Struct({ type: Schema.tag("role"), role: RoleSlug }),
  Schema.Struct({ type: Schema.tag("service_account"), id: AccessTokenId })
]).annotate({ identifier: "GrantSubject" })
export type GrantSubject = typeof GrantSubject.Type

/** A dot path into a tool call's arguments, e.g. `pieceName` or `input.owner`. */
export const ArgumentPath = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,7}$/)).annotate({
  identifier: "ArgumentPath"
})

export const ArgumentValue = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]).annotate({ identifier: "ArgumentValue" })
export type ArgumentValue = typeof ArgumentValue.Type

/**
 * Per tool name, the values each argument path may take: `{ "ap_run_action": { "pieceName": ["github"] } }`.
 * A call matches when every listed path holds an allowed value (each element, for an array); a missing
 * value does not match. This lets a generic upstream tool be granted per target, e.g. per piece and action.
 */
export const ArgumentConstraints = Schema.Record(
  Schema.NonEmptyString,
  Schema.Record(Schema.String, Schema.NonEmptyArray(ArgumentValue)).check(Schema.isPropertyNames(ArgumentPath))
).annotate({ identifier: "ArgumentConstraints" })
export type ArgumentConstraints = typeof ArgumentConstraints.Type

/**
 * Narrows a grant on an MCP server, tool or integration. Without `tools`, every tool (or integration action)
 * is allowed; without `arguments`, any arguments are.
 */
export const GrantConditions = Schema.Struct({
  tools: Schema.optionalKey(Schema.NonEmptyArray(Schema.NonEmptyString)),
  arguments: Schema.optionalKey(ArgumentConstraints)
}).annotate({ identifier: "GrantConditions" })
export type GrantConditions = typeof GrantConditions.Type

/** One action per grant: higher actions imply lower ones (see `actionImplies`). */
export class Grant extends Schema.Opaque<Grant>()(
  Schema.Struct({
    id: GrantId,
    orgId: OrgId,
    subject: GrantSubject,
    resourceId: ResourceId,
    action: Action,
    conditions: GrantConditions,
    expiresAt: Schema.NullOr(Timestamp),
    createdBy: UserId,
    createdAt: Timestamp,
    revokedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "Grant" })
) {}

export const CreateGrant = Schema.Struct({
  subject: GrantSubject,
  resourceId: ResourceId,
  action: Action,
  conditions: GrantConditions,
  expiresAt: Schema.NullOr(Timestamp)
}).annotate({ identifier: "CreateGrant" })
export type CreateGrant = typeof CreateGrant.Type

export const GrantFilter = Schema.Struct({
  resourceId: Schema.optionalKey(ResourceId),
  subjectId: Schema.optionalKey(Schema.String)
})
export type GrantFilter = typeof GrantFilter.Type

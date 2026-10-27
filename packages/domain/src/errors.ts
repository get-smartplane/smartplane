import { Schema } from "effect"
import { DenyReason } from "./access/decision"
import { EntityKind } from "./ids"
import { OrgPermission } from "./rbac"

export const UnauthorizedReason = Schema.Literals([
  "missing_credentials",
  "invalid_credentials",
  "expired",
  "no_organization",
  "deprovisioned"
])
export type UnauthorizedReason = typeof UnauthorizedReason.Type

/** `no_organization` tells the dashboard to send a signed-in user to onboarding. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { reason: UnauthorizedReason },
  { httpApiStatus: 401 }
) {}

/** `permission` is set when the caller lacks an org permission; absent for rule-based refusals. */
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  { message: Schema.String, permission: Schema.optionalKey(OrgPermission) },
  { httpApiStatus: 403 }
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { entity: EntityKind, id: Schema.String },
  { httpApiStatus: 404 }
) {}

export class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { message: Schema.String },
  { httpApiStatus: 409 }
) {}

export class InvalidInput extends Schema.TaggedError<InvalidInput>()(
  "InvalidInput",
  { message: Schema.String, field: Schema.optionalKey(Schema.String) },
  { httpApiStatus: 400 }
) {}

/** Access was refused by grants or guards; returned by the dashboard and the MCP gateway alike. */
export class PolicyDenied extends Schema.TaggedError<PolicyDenied>()(
  "PolicyDenied",
  { reasons: Schema.NonEmptyArray(DenyReason) },
  { httpApiStatus: 403 }
) {}

/** A dependency we call (WorkOS, Workers AI, an upstream MCP server) failed. */
export class UpstreamFailure extends Schema.TaggedError<UpstreamFailure>()(
  "UpstreamFailure",
  { upstream: Schema.String, message: Schema.String },
  { httpApiStatus: 502 }
) {}

/** A model call (compiler, example writer, lookup picker) did not answer within its budget. */
export class ModelTimedOut extends Schema.TaggedError<ModelTimedOut>()(
  "ModelTimedOut",
  { model: Schema.String, purpose: Schema.String, timeoutMs: Schema.Int },
  { httpApiStatus: 504 }
) {}

/** A lookup asked for a tool that is not known to be read-only; only reads may run on an admin's behalf. */
export class ReadOnlyRefused extends Schema.TaggedError<ReadOnlyRefused>()(
  "ReadOnlyRefused",
  { tool: Schema.String, reason: Schema.String },
  { httpApiStatus: 403 }
) {}

/** Too many requests for this token; retry after `retryAfterSeconds` (also sent as `Retry-After`). */
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  { retryAfterSeconds: Schema.Int },
  { httpApiStatus: 429 }
) {}

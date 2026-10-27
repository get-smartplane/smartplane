import { Schema } from "effect"
import { ResourceId } from "../ids"

/**
 * What a tool says it does, from its MCP annotations: `read` (`readOnlyHint`), `destructive`
 * (`destructiveHint`, which the spec assumes for a tool that is not read-only and says nothing more),
 * `write` (explicitly not destructive), or `unknown` (no hints). Display only: hints come from the server
 * and never decide policy.
 */
export const ToolAccess = Schema.Literals(["read", "write", "destructive", "unknown"]).annotate({ identifier: "ToolAccess" })
export type ToolAccess = typeof ToolAccess.Type

export const UpstreamToolSummary = Schema.Struct({
  name: Schema.NonEmptyString,
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  access: ToolAccess,
  idempotent: Schema.optionalKey(Schema.Boolean),
  openWorld: Schema.optionalKey(Schema.Boolean)
}).annotate({ identifier: "UpstreamToolSummary" })
export type UpstreamToolSummary = typeof UpstreamToolSummary.Type

/**
 * `available`: the server's tools as the caller may see them. `not_connected`: no account to list them with
 * yet. `unavailable`: the server could not be reached or refused; `message` says why.
 */
export const ResourceToolsStatus = Schema.Literals(["available", "not_connected", "unavailable"]).annotate({ identifier: "ResourceToolsStatus" })
export type ResourceToolsStatus = typeof ResourceToolsStatus.Type

export const ResourceTools = Schema.Struct({
  resourceId: ResourceId,
  status: ResourceToolsStatus,
  message: Schema.optionalKey(Schema.String),
  tools: Schema.Array(UpstreamToolSummary)
}).annotate({ identifier: "ResourceTools" })
export type ResourceTools = typeof ResourceTools.Type

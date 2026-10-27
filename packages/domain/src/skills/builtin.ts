import { Schema } from "effect"

/**
 * A skill shipped with Smartplane and served to every org next to its own, without a grant. Read-only: it is
 * not a resource, so it cannot be edited, deleted or revoked. The dashboard lists it as "Built-in".
 */
export const BuiltinSkillSummary = Schema.Struct({
  slug: Schema.String,
  description: Schema.String,
  /** Content hash of the served SKILL.md, as in the `smartplane.dev/version` MCP `_meta`. */
  version: Schema.String,
  builtin: Schema.Literal(true)
}).annotate({ identifier: "BuiltinSkillSummary" })
export type BuiltinSkillSummary = typeof BuiltinSkillSummary.Type

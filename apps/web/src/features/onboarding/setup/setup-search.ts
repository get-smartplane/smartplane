import { Schema } from "effect"
import { OAuthReturn } from "@/features/integrations/oauth-return"

/**
 * `/setup?step=…`. Plain strings, so a stale or hand-edited link never breaks the page: `viewOf` decodes the
 * step, and an OAuth return (`resource`, `integration` or `connection`, `reason`) is decoded where it is handled.
 */
export const SetupSearch = Schema.Struct({
  step: Schema.optionalKey(Schema.String),
  resource: Schema.optionalKey(Schema.String),
  ...OAuthReturn.fields,
  /** Set instead of `integration` when a catalog MCP server's sign-in returns here. */
  connection: Schema.optionalKey(Schema.String)
})
export type SetupSearch = typeof SetupSearch.Type

import { Schema } from "effect"

/** A curated Activepieces piece, by its package name without `@activepieces/piece-` (e.g. `github`, `google-sheets`). */
export const PieceId = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Schema.isMaxLength(64)).pipe(
  Schema.brand("PieceId")
).annotate({ identifier: "PieceId" })
export type PieceId = typeof PieceId.Type

/**
 * An action's name inside its piece (e.g. `create_issue_ai`). Kept to characters MCP tool names allow, since
 * gateway tools are named `<resource-slug>__<action>`.
 */
export const ActionName = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,96}$/)).annotate({ identifier: "ActionName" })
export type ActionName = typeof ActionName.Type

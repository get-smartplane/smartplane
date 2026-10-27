import type { IntegrationAction } from "@pc/domain"

const destructiveWords = /\b(?:delete|remove|archive|cancel|close|revoke|clear|purge|overwrite|replace|lock|ban|kick|refund)\b/i

/**
 * MCP tool annotations from the piece's classification. Hints only (clients may ask for confirmation);
 * policy is the grant check and guards. Unclassified actions are treated as possibly destructive.
 */
export const annotationsFor = (action: IntegrationAction): Readonly<Record<string, unknown>> => {
  const readOnly = action.classification === "read" || action.classification === "search"
  const destructive = action.classification === "destructive" || action.classification === null ||
    (action.classification === "write" && destructiveWords.test(`${action.name.replace(/[_-]/g, " ")} ${action.displayName}`))
  return {
    title: action.displayName,
    readOnlyHint: readOnly,
    ...(readOnly ? {} : { destructiveHint: destructive }),
    ...(action.idempotent === null ? (readOnly ? { idempotentHint: true } : {}) : { idempotentHint: action.idempotent }),
    openWorldHint: true
  }
}

import type { AuditQuery } from "@pc/domain"

/** Where a loaded page sits in the log: the latest events, newer than a seq, or older than one. */
export type AuditCursor =
  | { readonly _tag: "Latest" }
  | { readonly _tag: "Newer"; readonly after: number }
  | { readonly _tag: "Older"; readonly before: number }

export const latest: AuditCursor = { _tag: "Latest" }

export const cursorKey = (cursor: AuditCursor): string =>
  cursor._tag === "Latest" ? "latest" : cursor._tag === "Newer" ? `after-${cursor.after}` : `before-${cursor.before}`

export const cursorQuery = (cursor: AuditCursor): Pick<AuditQuery, "after" | "before"> =>
  cursor._tag === "Latest" ? {} : cursor._tag === "Newer" ? { after: cursor.after } : { before: cursor.before }

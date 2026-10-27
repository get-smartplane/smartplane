import type { AuditExportQuery, AuditQuery } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

/** One cursor page; the table stacks pages by passing each page's `nextCursor` as `before`. */
export const auditPageAtom = Atom.family((query: AuditQuery) => apiQuery(["audit"], (api) => api.audit.list({ query })))

export const chainVerificationAtom = apiQuery(["audit"], (api) => api.audit.verify({ query: {} }))

/** Exporting is itself audited, so the log refreshes afterwards. */
export const exportAuditAtom = apiMutation(["audit"], (api, query: AuditExportQuery) => api.audit.export({ query }))

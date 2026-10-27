import { AuditEventType } from "@pc/domain"
import { Schema } from "effect"

/** Audit filters live in the URL so a filtered view can be shared with an auditor. */
export const AuditSearch = Schema.Struct({
  type: Schema.optionalKey(AuditEventType),
  actorId: Schema.optionalKey(Schema.NonEmptyString),
  targetId: Schema.optionalKey(Schema.NonEmptyString)
})
export type AuditSearch = typeof AuditSearch.Type

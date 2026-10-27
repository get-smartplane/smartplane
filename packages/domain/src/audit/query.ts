import { Schema } from "effect"
import { Timestamp } from "../primitives"
import { ChainedAuditEvent } from "./event"
import { AuditEventType } from "./event-type"

const Seq = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

/**
 * Pages are newest first. Pass a page's `nextCursor` as `before` to page back to older events, or its
 * `prevCursor` as `after` to page forward to newer ones (also how a live view polls for new events).
 */
export const AuditQuery = Schema.Struct({
  type: Schema.optionalKey(AuditEventType),
  actorId: Schema.optionalKey(Schema.String),
  targetId: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Timestamp),
  to: Schema.optionalKey(Timestamp),
  before: Schema.optionalKey(Seq),
  after: Schema.optionalKey(Seq),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })))
})
export type AuditQuery = typeof AuditQuery.Type

export class AuditPage extends Schema.Opaque<AuditPage>()(
  Schema.Struct({
    events: Schema.Array(ChainedAuditEvent),
    /** `before` for the next older page; null when there are no older matching events. */
    nextCursor: Schema.NullOr(Seq),
    /** `after` for newer events: the newest seq on this page (or the anchor of an empty forward page). */
    prevCursor: Schema.NullOr(Seq)
  }).annotate({ identifier: "AuditPage" })
) {}

export const AuditVerifyQuery = Schema.Struct({
  fromSeq: Schema.optionalKey(Seq)
})
export type AuditVerifyQuery = typeof AuditVerifyQuery.Type

/** Result of re-hashing the chain. `Broken.at` is the first event whose hash or link does not match. */
export const ChainVerification = Schema.TaggedUnion({
  Intact: { fromSeq: Seq, checked: Schema.Int },
  Broken: { fromSeq: Seq, checked: Schema.Int, at: Seq }
}).annotate({ identifier: "ChainVerification" })
export type ChainVerification = typeof ChainVerification.Type

/** Evidence export for auditors: half-open range `[from, to)`. */
export const AuditExportQuery = Schema.Struct({
  from: Timestamp,
  to: Timestamp
})
export type AuditExportQuery = typeof AuditExportQuery.Type

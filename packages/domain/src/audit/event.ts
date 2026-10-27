import { Schema } from "effect"
import { AuditEventId, EntityKind, OrgId } from "../ids"
import { Timestamp } from "../primitives"
import { Actor } from "./actor"
import { AuditEventType } from "./event-type"

export const AuditTarget = Schema.Struct({
  type: EntityKind,
  id: Schema.String
}).annotate({ identifier: "AuditTarget" })
export type AuditTarget = typeof AuditTarget.Type

/**
 * An event as emitted, before it is chained. On the AUDIT_QUEUE it travels as an `AuditQueueMessage`.
 * `data` must never contain secret values or token plaintext.
 */
export class AuditEvent extends Schema.Opaque<AuditEvent>()(
  Schema.Struct({
    id: AuditEventId,
    orgId: OrgId,
    type: AuditEventType,
    actor: Actor,
    target: Schema.NullOr(AuditTarget),
    data: Schema.Record(Schema.String, Schema.Unknown),
    ip: Schema.NullOr(Schema.String),
    userAgent: Schema.NullOr(Schema.String),
    requestId: Schema.NullOr(Schema.String),
    occurredAt: Timestamp
  }).annotate({ identifier: "AuditEvent" })
) {}

export const Sha256Hex = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

/** A stored event: `seq` is gap-free per org and `hash = sha256(prevHash + canonical(event, seq))`. */
export class ChainedAuditEvent extends Schema.Opaque<ChainedAuditEvent>()(
  Schema.Struct({
    ...AuditEvent.fields,
    seq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    prevHash: Sha256Hex,
    hash: Sha256Hex
  }).annotate({ identifier: "ChainedAuditEvent" })
) {}

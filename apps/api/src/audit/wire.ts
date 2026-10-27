import { AuditEvent, AuditQueueMessage, ChainVerification } from "@pc/domain"
import { Schema } from "effect"

/** Durable Object RPC arguments and results cross a structured-clone boundary as JSON, decoded on arrival. */
export const AuditEventsWire = Schema.toCodecJson(Schema.Array(AuditEvent))
export const ChainVerificationWire = Schema.toCodecJson(ChainVerification)

/** AUDIT_QUEUE message bodies. */
export const AuditQueueMessageWire = Schema.toCodecJson(AuditQueueMessage)

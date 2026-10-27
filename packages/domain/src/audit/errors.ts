import { Schema } from "effect"

/**
 * An audit event could not be made durable (queue and direct append both failed after retries). Callers that
 * must not act unaudited, such as a gateway tool call, refuse to proceed on it.
 */
export class AuditUnavailable extends Schema.TaggedError<AuditUnavailable>()(
  "AuditUnavailable",
  { message: Schema.String },
  { httpApiStatus: 503 }
) {}

/** The R2 audit archive or the D1 rows behind it failed during an archive or purge step. */
export class ArchiveUnavailable extends Schema.TaggedError<ArchiveUnavailable>()(
  "ArchiveUnavailable",
  { operation: Schema.String, message: Schema.String },
  { httpApiStatus: 503 }
) {}

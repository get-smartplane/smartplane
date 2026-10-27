import { ChainedAuditEvent } from "@pc/domain"
import { Effect, Schema } from "effect"

const encode = Schema.encodeEffect(Schema.Array(Schema.toCodecJson(ChainedAuditEvent)))

/** One JSON-encoded `ChainedAuditEvent` per line, newline-terminated, in the order given. */
export const toNdjson = (events: ReadonlyArray<ChainedAuditEvent>) =>
  encode(events).pipe(
    Effect.orDie,
    Effect.map((encoded) => encoded.map((event) => `${JSON.stringify(event)}\n`).join(""))
  )

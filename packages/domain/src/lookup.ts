import { Schema } from "effect"
import { EntityKind } from "./ids"

/**
 * An id the dashboard wants a display name for. `kind` is an `EntityKind`, so audit targets pass straight
 * through; an audit actor maps `user` to `user` and `service_account` to `token` (system actors need no lookup).
 */
export const LookupRef = Schema.Struct({ kind: EntityKind, id: Schema.String.check(Schema.isBetweenLength(1, 80)) }).annotate({
  identifier: "LookupRef"
})
export type LookupRef = typeof LookupRef.Type

export const LookupRequest = Schema.Struct({
  refs: Schema.Array(LookupRef).check(Schema.isBetweenLength(1, 200))
}).annotate({ identifier: "LookupRequest" })
export type LookupRequest = typeof LookupRequest.Type

/**
 * `label` is the current display name; `detail` a secondary line (an email, a resource kind). `gone` marks a
 * removed or deprovisioned entity, still resolvable so history keeps reading well. Unknown refs are omitted.
 */
export const LookupEntry = Schema.Struct({
  kind: EntityKind,
  id: Schema.String,
  label: Schema.String,
  detail: Schema.NullOr(Schema.String),
  gone: Schema.Boolean
}).annotate({ identifier: "LookupEntry" })
export type LookupEntry = typeof LookupEntry.Type

export class LookupResult extends Schema.Opaque<LookupResult>()(
  Schema.Struct({ entries: Schema.Array(LookupEntry) }).annotate({ identifier: "LookupResult" })
) {}

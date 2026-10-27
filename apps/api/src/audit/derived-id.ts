import { AuditEventId, IdPrefix } from "@pc/domain"
import { Effect } from "effect"
import { sha256Hex } from "../platform/encoding"

/**
 * An event id derived from the fact it records (e.g. `approval.expired:<approvalId>`). Append is idempotent on
 * event id, so a step that re-records the same fact after a partial failure cannot write it twice.
 */
export const derivedEventId = (fact: string) =>
  Effect.map(Effect.promise(() => sha256Hex(fact)), (hash) => AuditEventId.make(`${IdPrefix.AuditEventId}_${hash.slice(0, 40)}`))

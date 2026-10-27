import type { ChainedAuditEvent, OrgId } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { SqlError, UnknownError } from "effect/sql/SqlError"
import { AuditStore } from "../audit/store"

/** An AuditStore over an array, exposing the rows so tests can tamper with them; `failNextInsert` simulates a D1 blip. */
export const memoryAuditStore = (rows: Array<ChainedAuditEvent> = [], failNextInsert = { pending: false }) =>
  Layer.succeed(AuditStore, {
    head: (orgId: OrgId) => {
      const last = rows.filter((row) => row.orgId === orgId).sort((a, b) => a.seq - b.seq).at(-1)
      return Effect.succeed(Option.map(Option.fromUndefinedOr(last), ({ seq, hash }) => ({ seq, hash })))
    },
    checkpoint: () => Effect.succeed(Option.none()),
    existingIds: (_orgId, ids) => Effect.succeed(new Set(rows.filter((row) => ids.includes(row.id)).map((row) => row.id))),
    insertAll: (events) => {
      const sqlError = (message: string) => new SqlError({ reason: new UnknownError({ cause: new Error(message), message }) })
      if (failNextInsert.pending) {
        failNextInsert.pending = false
        return Effect.fail(sqlError("simulated D1 failure"))
      }
      const clash = events.find((event) => rows.some((row) => row.id === event.id || (row.orgId === event.orgId && row.seq === event.seq)))
      if (clash !== undefined) return Effect.fail(sqlError(`audit event ${clash.id} clashes with a stored row`))
      return Effect.sync(() => void rows.push(...events))
    },
    range: (orgId, fromSeq, limit) =>
      Effect.succeed(rows.filter((row) => row.orgId === orgId && row.seq >= fromSeq).sort((a, b) => a.seq - b.seq).slice(0, limit)),
    page: () => Effect.die("not used"),
    deliveries: () => Effect.die("not used"),
    between: () => Effect.die("not used"),
    dayPage: () => Effect.die("not used")
  })

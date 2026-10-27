import { Actor, AuditTarget, ChainedAuditEvent, DeliverySummary, OrgId, type AuditPage, type AuditQuery } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { D1Client } from "@effect/sql-d1"
import { SqlClient } from "effect/sql"
import type { SqlError } from "effect/sql/SqlError"
import { decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"
import type { ChainHead } from "./chain"

const Row = Schema.Struct({
  ...ChainedAuditEvent.fields,
  actor: JsonColumn(Actor),
  target: JsonColumn(Schema.NullOr(AuditTarget)),
  data: JsonColumn(Schema.Record(Schema.String, Schema.Unknown))
})
const EventFromRow = Schema.toCodecJson(Row).pipe(Schema.decodeTo(ChainedAuditEvent))
const eventRows = decodeRows(EventFromRow)
const encodeEvent = encodeRow(EventFromRow)
const HeadRow = Schema.Struct({ seq: Schema.Int, hash: Schema.String })
const SummaryRow = Schema.toCodecJson(Schema.Struct({ ...DeliverySummary.fields, lastActor: JsonColumn(Actor) })).pipe(
  Schema.decodeTo(DeliverySummary)
)

const decodeIds = (rows: unknown) => Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ id: Schema.String })))(rows).pipe(Effect.orDie)
/** One archive day, capped at the last seq known when its export started, so the export matches its metadata. */
export interface DaySlice {
  readonly from: DateTime.Utc
  readonly to: DateTime.Utc
  readonly throughSeq: number
}

const iso = (value: DateTime.Utc) => DateTime.formatIso(value)
/** D1 binds at most 100 parameters per statement. */
const IdsPerQuery = 90
const DefaultPageSize = 100

/** D1 access for `audit_events`. Only the AuditLog Durable Object calls `insert`. */
export class AuditStore extends Context.Service<AuditStore, {
  /** The newest stored event, or the latest purge checkpoint when every event has been purged. */
  readonly head: (orgId: OrgId) => Effect.Effect<Option.Option<ChainHead>>
  /** The latest purge checkpoint: events up to it live only in the R2 archive. */
  readonly checkpoint: (orgId: OrgId) => Effect.Effect<Option.Option<ChainHead>>
  /** Which of `ids` are already stored (redeliveries; ids are unique across orgs); one query per 90 ids. */
  readonly existingIds: (orgId: OrgId, ids: ReadonlyArray<string>) => Effect.Effect<ReadonlySet<string>, SqlError>
  /**
   * Inserts already-chained events in one atomic D1 batch. A duplicate id or seq, or a link that does not extend
   * the stored head (migration 0019 trigger), fails the whole batch, so the chain never gets a gap.
   */
  readonly insertAll: (events: ReadonlyArray<ChainedAuditEvent>) => Effect.Effect<void, SqlError>
  readonly range: (orgId: OrgId, fromSeq: number, limit: number) => Effect.Effect<ReadonlyArray<ChainedAuditEvent>>
  readonly page: (orgId: OrgId, query: AuditQuery) => Effect.Effect<AuditPage>
  /** One row per delivered resource: its `secret.delivered` count and latest event, in one indexed scan. */
  readonly deliveries: (orgId: OrgId) => Effect.Effect<ReadonlyArray<DeliverySummary>>
  readonly between: (orgId: OrgId, from: DateTime.Utc, to: DateTime.Utc) => Effect.Effect<ReadonlyArray<ChainedAuditEvent>>
  /** Up to `limit` events of `[from, to)` with `afterSeq < seq <= throughSeq`, by seq: one page of a day export. */
  readonly dayPage: (orgId: OrgId, day: DaySlice, afterSeq: number, limit: number) => Effect.Effect<ReadonlyArray<ChainedAuditEvent>, SqlError>
}>()("api/audit/AuditStore") {
  static readonly layer = Layer.effect(
    AuditStore,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const d1 = yield* D1Client.D1Client
      const latestCheckpoint = (orgId: OrgId) =>
        sql`SELECT through_seq AS seq, through_hash AS hash FROM audit_purge_checkpoints
             WHERE org_id = ${orgId} ORDER BY through_seq DESC LIMIT 1`

      // Without the checkpoint fallback, an org whose events were all purged would restart its chain at seq 1.
      const head = Effect.fn("AuditStore.head")((orgId: OrgId) =>
        decodeFirst(HeadRow)(
          sql`SELECT seq, hash FROM (SELECT seq, hash FROM audit_events WHERE org_id = ${orgId} ORDER BY seq DESC LIMIT 1)
              UNION ALL SELECT seq, hash FROM (${latestCheckpoint(orgId)})
              ORDER BY seq DESC LIMIT 1`
        )
      )

      const checkpoint = Effect.fn("AuditStore.checkpoint")((orgId: OrgId) => decodeFirst(HeadRow)(latestCheckpoint(orgId)))

      const existingIds = Effect.fn("AuditStore.existingIds")(function*(orgId: OrgId, ids: ReadonlyArray<string>) {
        const found = new Set<string>()
        for (let offset = 0; offset < ids.length; offset += IdsPerQuery) {
          const chunk = ids.slice(offset, offset + IdsPerQuery)
          const rows = yield* sql`SELECT id FROM audit_events WHERE ${sql.in("id", chunk)}`
          for (const { id } of yield* decodeIds(rows)) found.add(id)
        }
        return found
      })

      const insertAll = Effect.fn("AuditStore.insertAll")(function*(events: ReadonlyArray<ChainedAuditEvent>) {
        if (events.length === 0) return
        const rows = yield* Effect.forEach(events, (event) =>
          Effect.map(encodeEvent(event), (row) => ({ ...row, actorId: event.actor.id, targetId: event.target?.id ?? null })))
        yield* d1.batch(rows.map((row) => d1`INSERT INTO audit_events ${d1.insert(row)}`))
      })

      const range = Effect.fn("AuditStore.range")((orgId: OrgId, fromSeq: number, limit: number) =>
        eventRows(sql`SELECT * FROM audit_events WHERE org_id = ${orgId} AND seq >= ${fromSeq} ORDER BY seq LIMIT ${limit}`)
      )

      /** Backward pages read newest first below `before`; forward pages read the oldest events above `after`. */
      const page = Effect.fn("AuditStore.page")(function*(orgId: OrgId, query: AuditQuery) {
        const limit = query.limit ?? DefaultPageSize
        const where = sql.and([
          sql`org_id = ${orgId}`,
          ...(query.type === undefined ? [] : [sql`type = ${query.type}`]),
          ...(query.actorId === undefined ? [] : [sql`actor_id = ${query.actorId}`]),
          ...(query.targetId === undefined ? [] : [sql`target_id = ${query.targetId}`]),
          ...(query.from === undefined ? [] : [sql`occurred_at >= ${iso(query.from)}`]),
          ...(query.to === undefined ? [] : [sql`occurred_at < ${iso(query.to)}`]),
          ...(query.before === undefined ? [] : [sql`seq < ${query.before}`]),
          ...(query.after === undefined ? [] : [sql`seq > ${query.after}`])
        ])
        const forward = query.after !== undefined
        const found = yield* eventRows(
          forward
            ? sql`SELECT * FROM audit_events WHERE ${where} ORDER BY seq ASC LIMIT ${limit + 1}`
            : sql`SELECT * FROM audit_events WHERE ${where} ORDER BY seq DESC LIMIT ${limit + 1}`
        )
        const kept = found.slice(0, limit)
        const events = forward ? kept.reverse() : kept
        const newest = events[0]?.seq
        const oldest = events.at(-1)?.seq
        const hasOlder = forward || found.length > limit
        const result: AuditPage = {
          events,
          nextCursor: hasOlder ? (oldest ?? null) : null,
          prevCursor: newest ?? query.after ?? null
        }
        return result
      })

      const between = Effect.fn("AuditStore.between")((orgId: OrgId, from: DateTime.Utc, to: DateTime.Utc) =>
        eventRows(
          sql`SELECT * FROM audit_events WHERE org_id = ${orgId} AND occurred_at >= ${iso(from)} AND occurred_at < ${
            iso(to)
          } ORDER BY seq`
        )
      )

      const deliveries = Effect.fn("AuditStore.deliveries")((orgId: OrgId) =>
        decodeRows(SummaryRow)(
          sql`SELECT target_id AS resource_id, total AS count, occurred_at AS last_delivered_at, actor AS last_actor FROM (
                SELECT target_id, occurred_at, actor, COUNT(*) OVER (PARTITION BY target_id) AS total,
                       ROW_NUMBER() OVER (PARTITION BY target_id ORDER BY seq DESC) AS newest
                  FROM audit_events WHERE org_id = ${orgId} AND type = 'secret.delivered' AND target_id IS NOT NULL
              ) WHERE newest = 1`
        )
      )

      const dayPage = Effect.fn("AuditStore.dayPage")(function*(orgId: OrgId, day: DaySlice, afterSeq: number, limit: number) {
        const rows = yield* sql`SELECT * FROM audit_events WHERE org_id = ${orgId} AND occurred_at >= ${iso(day.from)}
                                  AND occurred_at < ${iso(day.to)} AND seq > ${afterSeq} AND seq <= ${day.throughSeq}
                                ORDER BY seq LIMIT ${limit}`
        return yield* eventRows(Effect.succeed(rows))
      })

      return AuditStore.of({ head, checkpoint, existingIds, insertAll, range, page, deliveries, between, dayPage })
    })
  )
}

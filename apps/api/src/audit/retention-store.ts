import { OrgId } from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { decodeFirst, decodeRows } from "../platform/sql"

const OrgRetention = Schema.Struct({ orgId: OrgId, auditRetentionDays: Schema.Int })
const DayRange = Schema.Struct({ firstSeq: Schema.Int, lastSeq: Schema.Int, lastHash: Schema.String })
const Seq = Schema.Struct({ seq: Schema.Int })
const Hash = Schema.Struct({ hash: Schema.String })
const OccurredAt = Schema.Struct({ occurredAt: Schema.DateTimeUtcFromString })

export type DayRange = typeof DayRange.Type

export interface PurgeCheckpoint {
  readonly orgId: OrgId
  readonly throughSeq: number
  readonly throughHash: string
  readonly archivedKey: string
}

const iso = DateTime.formatIso

/** D1 reads and the one delete path behind the audit retention purge. */
export class AuditRetentionStore extends Context.Service<AuditRetentionStore, {
  readonly orgs: () => Effect.Effect<ReadonlyArray<typeof OrgRetention.Type>>
  /** When the oldest stored event at or after `from` occurred. */
  readonly nextEventAt: (orgId: OrgId, from: DateTime.Utc) => Effect.Effect<Option.Option<DateTime.Utc>>
  readonly dayRange: (orgId: OrgId, from: DateTime.Utc, to: DateTime.Utc) => Effect.Effect<Option.Option<DayRange>>
  /** The lowest seq of an event that occurred at or after `at`. */
  readonly firstSeqFrom: (orgId: OrgId, at: DateTime.Utc) => Effect.Effect<Option.Option<number>>
  readonly hashAt: (orgId: OrgId, seq: number) => Effect.Effect<Option.Option<string>>
  /**
   * Records the checkpoint and deletes the events it covers in one atomic batch; the 0003 triggers refuse a
   * checkpoint that does not name a stored event and any delete not covered by one. Returns rows deleted.
   */
  readonly purge: (checkpoint: PurgeCheckpoint) => Effect.Effect<number>
}>()("api/audit/AuditRetentionStore") {
  static readonly layer = Layer.effect(
    AuditRetentionStore,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client

      return AuditRetentionStore.of({
        orgs: Effect.fn("AuditRetentionStore.orgs")(() =>
          decodeRows(OrgRetention)(sql`SELECT id AS org_id, audit_retention_days FROM orgs ORDER BY id`)
        ),
        nextEventAt: Effect.fn("AuditRetentionStore.nextEventAt")((orgId: OrgId, from: DateTime.Utc) =>
          decodeFirst(OccurredAt)(
            sql`SELECT MIN(occurred_at) AS occurred_at FROM audit_events WHERE org_id = ${orgId} AND occurred_at >= ${iso(from)}
                HAVING COUNT(*) > 0`
          ).pipe(Effect.map(Option.map((row) => row.occurredAt)))
        ),
        dayRange: Effect.fn("AuditRetentionStore.dayRange")((orgId: OrgId, from: DateTime.Utc, to: DateTime.Utc) =>
          decodeFirst(DayRange)(
            sql`SELECT MIN(seq) AS first_seq, MAX(seq) AS last_seq,
                       (SELECT hash FROM audit_events WHERE org_id = ${orgId} AND occurred_at >= ${iso(from)}
                           AND occurred_at < ${iso(to)} ORDER BY seq DESC LIMIT 1) AS last_hash
                  FROM audit_events WHERE org_id = ${orgId} AND occurred_at >= ${iso(from)} AND occurred_at < ${iso(to)}
                HAVING COUNT(*) > 0`
          )
        ),
        firstSeqFrom: Effect.fn("AuditRetentionStore.firstSeqFrom")((orgId: OrgId, at: DateTime.Utc) =>
          decodeFirst(Seq)(
            sql`SELECT MIN(seq) AS seq FROM audit_events WHERE org_id = ${orgId} AND occurred_at >= ${iso(at)} HAVING COUNT(*) > 0`
          ).pipe(Effect.map(Option.map((row) => row.seq)))
        ),
        hashAt: Effect.fn("AuditRetentionStore.hashAt")((orgId: OrgId, seq: number) =>
          decodeFirst(Hash)(sql`SELECT hash FROM audit_events WHERE org_id = ${orgId} AND seq = ${seq}`).pipe(
            Effect.map(Option.map((row) => row.hash))
          )
        ),
        purge: Effect.fn("AuditRetentionStore.purge")(function*(checkpoint: PurgeCheckpoint) {
          const purgedAt = iso(yield* DateTime.now)
          const [, deleted] = yield* sql.batch([
            sql`INSERT INTO audit_purge_checkpoints ${sql.insert({ ...checkpoint, purgedAt })}`,
            sql`DELETE FROM audit_events WHERE org_id = ${checkpoint.orgId} AND seq <= ${checkpoint.throughSeq} RETURNING seq`
          ]).pipe(Effect.orDie)
          return deleted.length
        })
      })
    })
  )
}

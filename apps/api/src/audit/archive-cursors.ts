import { ArchiveUnavailable, type OrgId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { SqlError } from "effect/sql/SqlError"

const Cursor = Schema.Struct({ throughDay: Schema.String })
const Day = Schema.Struct({ day: Schema.String })

const typed = (operation: string) => <A, R>(effect: Effect.Effect<A, SqlError, R>) =>
  Effect.mapError(effect, (error) => new ArchiveUnavailable({ operation, message: `D1 ${operation} failed: ${error.message}` }))

/** A row that does not decode means D1 and the code disagree: a bug, so a defect. */
const decoded = <S extends Schema.Codec<unknown, unknown>>(schema: S) => (rows: unknown) =>
  Schema.decodeUnknownEffect(Schema.Array(schema))(rows).pipe(Effect.orDie)

/** Per-org progress of the nightly R2 archive (`audit_archive_cursors`, migration 0019). */
export class AuditArchiveCursors extends Context.Service<AuditArchiveCursors, {
  /** The last `YYYY-MM-DD` day archived in order; none before the first archive. */
  readonly throughDay: (orgId: OrgId) => Effect.Effect<Option.Option<string>, ArchiveUnavailable>
  readonly advance: (orgId: OrgId, day: string) => Effect.Effect<void, ArchiveUnavailable>
  /** Days (UTC, ascending) that hold events, after `afterDay` and before `beforeDay`. */
  readonly eventDays: (orgId: OrgId, afterDay: Option.Option<string>, beforeDay: string, limit: number) => Effect.Effect<ReadonlyArray<string>, ArchiveUnavailable>
}>()("api/audit/AuditArchiveCursors") {
  static readonly layer = Layer.effect(
    AuditArchiveCursors,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return AuditArchiveCursors.of({
        throughDay: Effect.fn("AuditArchiveCursors.throughDay")(function*(orgId: OrgId) {
          const rows = yield* typed("read cursor")(sql`SELECT through_day FROM audit_archive_cursors WHERE org_id = ${orgId}`)
          const [row] = yield* decoded(Cursor)(rows)
          return Option.map(Option.fromUndefinedOr(row), (found) => found.throughDay)
        }),
        advance: Effect.fn("AuditArchiveCursors.advance")(function*(orgId: OrgId, day: string) {
          const updatedAt = DateTime.formatIso(yield* DateTime.now)
          yield* typed("advance cursor")(
            sql`INSERT INTO audit_archive_cursors (org_id, through_day, updated_at) VALUES (${orgId}, ${day}, ${updatedAt})
                ON CONFLICT(org_id) DO UPDATE SET through_day = excluded.through_day, updated_at = excluded.updated_at
                WHERE excluded.through_day > audit_archive_cursors.through_day`
          )
        }),
        eventDays: Effect.fn("AuditArchiveCursors.eventDays")(function*(orgId: OrgId, afterDay: Option.Option<string>, beforeDay: string, limit: number) {
          // `occurred_at` is ISO-8601 UTC, so the day after `afterDay` starts at any string above `afterDay` + "T~".
          const from = Option.match(afterDay, { onNone: () => "", onSome: (day) => `${day}T~` })
          const rows = yield* typed("list days")(
            sql`SELECT DISTINCT substr(occurred_at, 1, 10) AS day FROM audit_events
                 WHERE org_id = ${orgId} AND occurred_at > ${from} AND occurred_at < ${beforeDay}
                 ORDER BY day LIMIT ${limit}`
          )
          return (yield* decoded(Day)(rows)).map((row) => row.day)
        })
      })
    })
  )
}

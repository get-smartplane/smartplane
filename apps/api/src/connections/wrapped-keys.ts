import { ConnectionId, OrgId } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows } from "../platform/sql"
import type { Envelope } from "../secrets/envelope"

const StaleRow = Schema.Struct({
  id: ConnectionId,
  orgId: OrgId,
  ciphertext: Schema.String,
  iv: Schema.String,
  wrappedDek: Schema.String,
  kekId: Schema.String
})
export type StaleConnection = typeof StaleRow.Type
const Count = Schema.Struct({ count: Schema.Int })

/** Connection credentials by the KEK wrapping their data key, so KEK rotation covers them like secret versions. */
export class ConnectionKeysRepo extends Context.Service<ConnectionKeysRepo, {
  readonly wrappedBy: (kekIds: ReadonlyArray<string>, orgId: OrgId | undefined, limit: number) => Effect.Effect<ReadonlyArray<StaleConnection>>
  readonly countNotWrappedBy: (currentKekId: string, orgId: OrgId | undefined) => Effect.Effect<number>
  /** Swaps the wrapped data key only if the credential is unchanged since it was read. */
  readonly replace: (stale: StaleConnection, next: Envelope) => Effect.Effect<boolean>
}>()("api/connections/ConnectionKeysRepo") {
  static readonly layer = Layer.effect(
    ConnectionKeysRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const inOrg = (orgId: OrgId | undefined) => (orgId === undefined ? sql`1 = 1` : sql`org_id = ${orgId}`)
      return ConnectionKeysRepo.of({
        wrappedBy: Effect.fn("ConnectionKeysRepo.wrappedBy")((kekIds: ReadonlyArray<string>, orgId: OrgId | undefined, limit: number) =>
          kekIds.length === 0 ? Effect.succeed([]) : decodeRows(StaleRow)(
            sql`SELECT id, org_id, ciphertext, iv, wrapped_dek, kek_id FROM connections
                 WHERE ${sql.in("kek_id", kekIds)} AND ${inOrg(orgId)} ORDER BY connected_at LIMIT ${limit}`
          )
        ),
        countNotWrappedBy: Effect.fn("ConnectionKeysRepo.countNotWrappedBy")((currentKekId: string, orgId: OrgId | undefined) =>
          decodeFirst(Count)(sql`SELECT COUNT(*) AS count FROM connections WHERE kek_id IS NOT NULL AND kek_id != ${currentKekId} AND ${inOrg(orgId)}`).pipe(
            Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.count }))
          )
        ),
        replace: Effect.fn("ConnectionKeysRepo.replace")((stale: StaleConnection, next: Envelope) =>
          sql`UPDATE connections SET wrapped_dek = ${next.wrappedDek}, kek_id = ${next.kekId}
               WHERE id = ${stale.id} AND kek_id = ${stale.kekId} AND ciphertext = ${next.ciphertext} AND iv = ${next.iv}
               RETURNING id`.pipe(Effect.map((rows) => rows.length > 0), Effect.orDie)
        )
      })
    })
  )
}

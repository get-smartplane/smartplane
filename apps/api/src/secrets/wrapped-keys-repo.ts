import { OrgId, ResourceId } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows } from "../platform/sql"
import type { Envelope } from "./envelope"

const StaleRow = Schema.Struct({
  orgId: OrgId,
  resourceId: ResourceId,
  version: Schema.Int,
  ciphertext: Schema.String,
  iv: Schema.String,
  wrappedDek: Schema.String,
  kekId: Schema.String
})
export type StaleVersion = typeof StaleRow.Type
const Count = Schema.Struct({ count: Schema.Int })

/** Secret versions by the KEK that wraps their data key, for KEK rotation. Covers deleted resources too. */
export class WrappedKeysRepo extends Context.Service<WrappedKeysRepo, {
  /** Versions wrapped by one of `kekIds`, optionally in one org, oldest first. */
  readonly wrappedBy: (kekIds: ReadonlyArray<string>, orgId: OrgId | undefined, limit: number) => Effect.Effect<ReadonlyArray<StaleVersion>>
  /** Versions not yet wrapped by `currentKekId`. */
  readonly countNotWrappedBy: (currentKekId: string, orgId: OrgId | undefined) => Effect.Effect<number>
  /** Swaps the wrapped data key if the row is still under `fromKekId`; false when another run got there first. */
  readonly replace: (version: StaleVersion, next: Envelope) => Effect.Effect<boolean>
}>()("api/secrets/WrappedKeysRepo") {
  static readonly layer = Layer.effect(
    WrappedKeysRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const inOrg = (orgId: OrgId | undefined) => (orgId === undefined ? sql`1 = 1` : sql`r.org_id = ${orgId}`)

      return WrappedKeysRepo.of({
        wrappedBy: Effect.fn("WrappedKeysRepo.wrappedBy")((kekIds: ReadonlyArray<string>, orgId: OrgId | undefined, limit: number) =>
          kekIds.length === 0 ? Effect.succeed([]) : decodeRows(StaleRow)(
            sql`SELECT r.org_id, sv.resource_id, sv.version, sv.ciphertext, sv.iv, sv.wrapped_dek, sv.kek_id
                  FROM secret_versions sv JOIN resources r ON r.id = sv.resource_id
                 WHERE ${sql.in("sv.kek_id", kekIds)} AND ${inOrg(orgId)}
                 ORDER BY sv.created_at LIMIT ${limit}`
          )
        ),
        countNotWrappedBy: Effect.fn("WrappedKeysRepo.countNotWrappedBy")((currentKekId: string, orgId: OrgId | undefined) =>
          decodeFirst(Count)(
            sql`SELECT COUNT(*) AS count FROM secret_versions sv JOIN resources r ON r.id = sv.resource_id
                 WHERE sv.kek_id != ${currentKekId} AND ${inOrg(orgId)}`
          ).pipe(Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.count })))
        ),
        replace: Effect.fn("WrappedKeysRepo.replace")((version: StaleVersion, next: Envelope) =>
          sql`UPDATE secret_versions SET wrapped_dek = ${next.wrappedDek}, kek_id = ${next.kekId}
               WHERE resource_id = ${version.resourceId} AND version = ${version.version} AND kek_id = ${version.kekId}
                 AND ciphertext = ${next.ciphertext} AND iv = ${next.iv}
               RETURNING version`.pipe(Effect.map((rows) => rows.length > 0), Effect.orDie)
        )
      })
    })
  )
}

import { MachineToken, type MachineTokenId, type OrgId, ResourceId, type UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, type Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"

const MachineTokenRow = Schema.toCodecJson(
  Schema.Struct({ ...MachineToken.fields, allow: JsonColumn(Schema.Array(ResourceId)) })
).pipe(Schema.decodeTo(MachineToken))
const encodeToken = encodeRow(MachineTokenRow)

/** Machine tokens by org. Only the SHA-256 of a token is ever written. */
export class MachineTokensRepo extends Context.Service<MachineTokensRepo, {
  readonly insert: (token: MachineToken, hash: string) => Effect.Effect<void>
  readonly list: (orgId: OrgId) => Effect.Effect<ReadonlyArray<MachineToken>>
  /** Live (unrevoked, unexpired) tokens, for access review snapshots. */
  readonly live: (orgId: OrgId) => Effect.Effect<ReadonlyArray<MachineToken>>
  readonly find: (orgId: OrgId, id: MachineTokenId) => Effect.Effect<Option.Option<MachineToken>>
  readonly findByHash: (hash: string) => Effect.Effect<Option.Option<MachineToken>>
  /** Moves the expiry of an active token; false when it is revoked or unknown. */
  readonly renew: (orgId: OrgId, id: MachineTokenId, expiresAt: DateTime.Utc) => Effect.Effect<boolean>
  readonly revoke: (orgId: OrgId, id: MachineTokenId, by: UserId) => Effect.Effect<boolean>
  readonly touch: (id: MachineTokenId, ip: string | null) => Effect.Effect<void>
}>()("api/delivery/MachineTokensRepo") {
  static readonly layer = Layer.effect(
    MachineTokensRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT id, org_id, name, prefix, project_id, allow, created_by, created_at, expires_at, last_used_at,
                                last_used_ip, revoked_at FROM machine_tokens`
      const rows = decodeRows(MachineTokenRow)
      const now = Effect.map(DateTime.now, DateTime.formatIso)

      return MachineTokensRepo.of({
        insert: Effect.fn("MachineTokensRepo.insert")(function*(token: MachineToken, hash: string) {
          const row = { ...(yield* encodeToken(token)), tokenHash: hash }
          yield* sql`INSERT INTO machine_tokens ${sql.insert(row)}`.pipe(Effect.orDie)
        }),
        list: Effect.fn("MachineTokensRepo.list")((orgId: OrgId) =>
          rows(sql`${select} WHERE org_id = ${orgId} ORDER BY created_at DESC`)
        ),
        live: Effect.fn("MachineTokensRepo.live")(function*(orgId: OrgId) {
          return yield* rows(sql`${select} WHERE org_id = ${orgId} AND revoked_at IS NULL AND expires_at > ${yield* now} ORDER BY name`)
        }),
        find: Effect.fn("MachineTokensRepo.find")((orgId: OrgId, id: MachineTokenId) =>
          decodeFirst(MachineTokenRow)(sql`${select} WHERE org_id = ${orgId} AND id = ${id}`)
        ),
        findByHash: Effect.fn("MachineTokensRepo.findByHash")((hash: string) =>
          decodeFirst(MachineTokenRow)(sql`${select} WHERE token_hash = ${hash}`)
        ),
        renew: Effect.fn("MachineTokensRepo.renew")(function*(orgId: OrgId, id: MachineTokenId, expiresAt: DateTime.Utc) {
          const updated = yield* sql`UPDATE machine_tokens SET expires_at = ${DateTime.formatIso(expiresAt)}
                                      WHERE id = ${id} AND org_id = ${orgId} AND revoked_at IS NULL RETURNING id`.pipe(Effect.orDie)
          return updated.length > 0
        }),
        revoke: Effect.fn("MachineTokensRepo.revoke")(function*(orgId: OrgId, id: MachineTokenId, by: UserId) {
          const updated = yield* sql`UPDATE machine_tokens SET revoked_at = ${yield* now}, revoked_by = ${by}
                                      WHERE id = ${id} AND org_id = ${orgId} AND revoked_at IS NULL RETURNING id`.pipe(Effect.orDie)
          return updated.length > 0
        }),
        touch: Effect.fn("MachineTokensRepo.touch")(function*(id: MachineTokenId, ip: string | null) {
          yield* sql`UPDATE machine_tokens SET last_used_at = ${yield* now}, last_used_ip = ${ip} WHERE id = ${id}`.pipe(Effect.orDie)
        })
      })
    })
  )
}

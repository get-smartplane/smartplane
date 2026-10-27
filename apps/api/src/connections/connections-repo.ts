import { AccountIdentity, AccountMode, type Connection, ConnectionId, ConnectionMethod, ConnectionStatus, OrgId, ResourceId, Timestamp, UserId } from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { decodeFirst, decodeRows, JsonColumn } from "../platform/sql"
import type { Envelope } from "../secrets/envelope"

const Row = Schema.toCodecJson(Schema.Struct({
  id: ConnectionId,
  orgId: OrgId,
  resourceId: ResourceId,
  mode: AccountMode,
  userId: Schema.NullOr(UserId),
  method: ConnectionMethod,
  status: ConnectionStatus,
  accountIdentity: Schema.NullOr(JsonColumn(AccountIdentity)),
  connectedBy: UserId,
  connectedByEmail: Schema.NullOr(Schema.String),
  connectedAt: Timestamp,
  refreshedAt: Schema.NullOr(Timestamp),
  version: Schema.Int,
  ciphertext: Schema.NullOr(Schema.String),
  iv: Schema.NullOr(Schema.String),
  wrappedDek: Schema.NullOr(Schema.String),
  kekId: Schema.NullOr(Schema.String)
}))
type Row = typeof Row.Type

/** A connection with what only apps/api sees: its write version and its encrypted credential, if it holds one. */
export interface StoredConnection {
  readonly connection: Connection
  readonly version: number
  readonly envelope: Envelope | null
}

const stored = ({ connectedBy, connectedByEmail, version, ciphertext, iv, wrappedDek, kekId, ...fields }: Row): StoredConnection => ({
  connection: { ...fields, connectedBy: { userId: connectedBy, email: connectedByEmail } },
  version,
  envelope: ciphertext === null || iv === null || wrappedDek === null || kekId === null ? null : { ciphertext, iv, wrappedDek, kekId }
})

const encodeIdentity = Schema.encodeEffect(Schema.NullOr(JsonColumn(AccountIdentity)))

/**
 * Connected accounts. The shared connection of a resource has no `user_id`; per-user connections are keyed by
 * (resource, user), so a lookup by the caller's own id is the only way to reach one.
 */
export class ConnectionsRepo extends Context.Service<ConnectionsRepo, {
  /** `owner` null: the shared connection. */
  readonly find: (orgId: OrgId, resourceId: ResourceId, owner: UserId | null) => Effect.Effect<Option.Option<StoredConnection>>
  /** One member's own connections across the org. */
  readonly ofUser: (orgId: OrgId, userId: UserId) => Effect.Effect<ReadonlyArray<Connection>>
  /** Inserts the connection, replacing any earlier one of the same owner for the resource. */
  readonly put: (connection: Connection, envelope: Envelope | null) => Effect.Effect<void>
  /** Writes a refreshed credential if nobody wrote since `version`; false when another call got there first. */
  readonly replaceCredential: (stored: StoredConnection, envelope: Envelope) => Effect.Effect<boolean>
  readonly markNeedsReauth: (id: ConnectionId) => Effect.Effect<void>
  /** Deletes the owner's connection; returns what was deleted. */
  readonly remove: (orgId: OrgId, resourceId: ResourceId, owner: UserId | null) => Effect.Effect<Option.Option<Connection>>
  /** Every connection of the resource made in `mode` (`ResourcesRepo.switchAccountMode` deletes them). */
  readonly inMode: (orgId: OrgId, resourceId: ResourceId, mode: AccountMode) => Effect.Effect<ReadonlyArray<Connection>>
}>()("api/connections/ConnectionsRepo") {
  static readonly layer = Layer.effect(
    ConnectionsRepo,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const select = sql`SELECT c.id, c.org_id, c.resource_id, c.mode, c.user_id, c.method, c.status, c.account_identity,
                                c.connected_by, u.email AS connected_by_email, c.connected_at, c.refreshed_at, c.version,
                                c.ciphertext, c.iv, c.wrapped_dek, c.kek_id
                           FROM connections c LEFT JOIN users u ON u.id = c.connected_by`
      const ownedBy = (owner: UserId | null) => (owner === null ? sql`c.user_id IS NULL` : sql`c.user_id = ${owner}`)
      const rows = (query: Effect.Effect<ReadonlyArray<unknown>, unknown>) => Effect.map(decodeRows(Row)(query), (all) => all.map(stored))
      const deleted = (query: Effect.Effect<ReadonlyArray<unknown>, unknown>) =>
        Effect.map(decodeRows(Schema.Struct({ id: ConnectionId }))(query), (ids) => ids.map(({ id }) => id))

      const find = Effect.fn("ConnectionsRepo.find")((orgId: OrgId, resourceId: ResourceId, owner: UserId | null) =>
        Effect.map(decodeFirst(Row)(sql`${select} WHERE c.org_id = ${orgId} AND c.resource_id = ${resourceId} AND ${ownedBy(owner)}`), Option.map(stored))
      )

      return ConnectionsRepo.of({
        find,
        ofUser: Effect.fn("ConnectionsRepo.ofUser")((orgId: OrgId, userId: UserId) =>
          Effect.map(rows(sql`${select} WHERE c.org_id = ${orgId} AND c.user_id = ${userId} ORDER BY c.connected_at`), (all) => all.map((row) => row.connection))
        ),
        put: Effect.fn("ConnectionsRepo.put")(function*(connection: Connection, envelope: Envelope | null) {
          const row = {
            id: connection.id,
            orgId: connection.orgId,
            resourceId: connection.resourceId,
            userId: connection.userId,
            mode: connection.mode,
            method: connection.method,
            status: connection.status,
            accountIdentity: yield* Effect.orDie(encodeIdentity(connection.accountIdentity)),
            connectedBy: connection.connectedBy.userId,
            connectedAt: DateTime.formatIso(connection.connectedAt),
            refreshedAt: connection.refreshedAt === null ? null : DateTime.formatIso(connection.refreshedAt),
            version: 1,
            ciphertext: envelope?.ciphertext ?? null,
            iv: envelope?.iv ?? null,
            wrappedDek: envelope?.wrappedDek ?? null,
            kekId: envelope?.kekId ?? null
          }
          yield* sql.batch([
            sql`DELETE FROM connections WHERE org_id = ${connection.orgId} AND resource_id = ${connection.resourceId}
                 AND ${connection.userId === null ? sql`user_id IS NULL` : sql`user_id = ${connection.userId}`}`,
            sql`INSERT INTO connections ${sql.insert(row)}`
          ]).pipe(Effect.orDie)
        }),
        replaceCredential: Effect.fn("ConnectionsRepo.replaceCredential")(function*(current: StoredConnection, envelope: Envelope) {
          const now = DateTime.formatIso(yield* DateTime.now)
          const updated = yield* sql`UPDATE connections
                                        SET ciphertext = ${envelope.ciphertext}, iv = ${envelope.iv}, wrapped_dek = ${envelope.wrappedDek},
                                            kek_id = ${envelope.kekId}, version = version + 1, refreshed_at = ${now}, status = 'connected'
                                      WHERE id = ${current.connection.id} AND version = ${current.version} RETURNING id`.pipe(Effect.orDie)
          return updated.length > 0
        }),
        markNeedsReauth: Effect.fn("ConnectionsRepo.markNeedsReauth")((id: ConnectionId) =>
          sql`UPDATE connections SET status = 'needs_reauth' WHERE id = ${id}`.pipe(Effect.asVoid, Effect.orDie)
        ),
        remove: Effect.fn("ConnectionsRepo.remove")(function*(orgId: OrgId, resourceId: ResourceId, owner: UserId | null) {
          const found = yield* find(orgId, resourceId, owner)
          if (Option.isNone(found)) return Option.none()
          yield* deleted(sql`DELETE FROM connections WHERE id = ${found.value.connection.id} RETURNING id`)
          return Option.some(found.value.connection)
        }),
        inMode: Effect.fn("ConnectionsRepo.inMode")((orgId: OrgId, resourceId: ResourceId, mode: AccountMode) =>
          Effect.map(rows(sql`${select} WHERE c.org_id = ${orgId} AND c.resource_id = ${resourceId} AND c.mode = ${mode}`), (all) => all.map((row) => row.connection))
        )
      })
    })
  )
}

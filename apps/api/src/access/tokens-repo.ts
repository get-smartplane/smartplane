import {
  AccessToken,
  type AccessTokenId,
  Email,
  MembershipId,
  MemberStatus,
  type OrgId,
  RoleSlug,
  type UserId
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows, encodeRow } from "../platform/sql"

const TokenRow = Schema.toCodecJson(AccessToken)
const encodeToken = encodeRow(TokenRow)

const liveness = {
  membershipId: Schema.NullOr(MembershipId),
  membershipStatus: Schema.NullOr(MemberStatus),
  role: Schema.NullOr(RoleSlug),
  userStatus: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Email)
}
const CredentialRow = Schema.toCodecJson(Schema.Struct({ ...AccessToken.fields, ...liveness }))

/** A token joined with what authentication needs to decide whether it is still alive. */
export interface Credential extends Schema.Struct.Type<typeof liveness> {
  readonly token: AccessToken
}

export class TokensRepo extends Context.Service<TokensRepo, {
  readonly insert: (token: AccessToken, hash: string, membershipId: MembershipId | null) => Effect.Effect<void>
  readonly list: (orgId: OrgId, createdBy: UserId | null) => Effect.Effect<ReadonlyArray<AccessToken>>
  readonly find: (orgId: OrgId, id: AccessTokenId) => Effect.Effect<Option.Option<AccessToken>>
  /** Revokes an active token; `owner` restricts it to tokens that user created. */
  readonly revoke: (orgId: OrgId, id: AccessTokenId, owner: UserId | null) => Effect.Effect<boolean>
  readonly findByHash: (hash: string) => Effect.Effect<Option.Option<Credential>>
  readonly touch: (id: AccessTokenId) => Effect.Effect<void>
}>()("api/access/TokensRepo") {
  static readonly layer = Layer.effect(
    TokensRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const columns = sql`t.id, t.org_id, t.kind, t.name, t.prefix, t.created_by, t.project_id, t.expires_at, t.last_used_at,
                          t.created_at, t.revoked_at`

      return TokensRepo.of({
        insert: Effect.fn("TokensRepo.insert")(function*(token: AccessToken, hash: string, membershipId: MembershipId | null) {
          const row = { ...(yield* encodeToken(token)), tokenHash: hash, membershipId }
          yield* sql`INSERT INTO access_tokens ${sql.insert(row)}`.pipe(Effect.orDie)
        }),
        list: Effect.fn("TokensRepo.list")((orgId: OrgId, createdBy: UserId | null) =>
          decodeRows(TokenRow)(
            sql`SELECT ${columns} FROM access_tokens t
                 WHERE t.org_id = ${orgId} AND (${createdBy} IS NULL OR t.created_by = ${createdBy}) ORDER BY t.created_at DESC`
          )
        ),
        find: Effect.fn("TokensRepo.find")((orgId: OrgId, id: AccessTokenId) =>
          decodeFirst(TokenRow)(sql`SELECT ${columns} FROM access_tokens t WHERE t.org_id = ${orgId} AND t.id = ${id}`)
        ),
        revoke: Effect.fn("TokensRepo.revoke")(function*(orgId: OrgId, id: AccessTokenId, owner: UserId | null) {
          const now = DateTime.formatIso(yield* DateTime.now)
          const rows = yield* sql`UPDATE access_tokens SET revoked_at = ${now}
                                   WHERE id = ${id} AND org_id = ${orgId} AND revoked_at IS NULL
                                     AND (${owner} IS NULL OR created_by = ${owner}) RETURNING id`.pipe(Effect.orDie)
          return rows.length > 0
        }),
        findByHash: Effect.fn("TokensRepo.findByHash")((hash: string) =>
          decodeFirst(CredentialRow)(
            sql`SELECT ${columns}, t.membership_id, m.status AS membership_status, m.role, u.status AS user_status, u.email
                  FROM access_tokens t
                  LEFT JOIN memberships m ON m.id = t.membership_id
                  LEFT JOIN users u ON u.id = m.user_id
                 WHERE t.token_hash = ${hash}`
          ).pipe(Effect.map(Option.map(({ membershipId, membershipStatus, role, userStatus, email, ...token }): Credential => ({
            token,
            membershipId,
            membershipStatus,
            role,
            userStatus,
            email
          }))))
        ),
        touch: Effect.fn("TokensRepo.touch")(function*(id: AccessTokenId) {
          const now = DateTime.formatIso(yield* DateTime.now)
          yield* sql`UPDATE access_tokens SET last_used_at = ${now} WHERE id = ${id}`.pipe(Effect.orDie)
        })
      })
    })
  )
}

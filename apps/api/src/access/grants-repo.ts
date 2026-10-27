import { Grant, GrantConditions, type GrantFilter, type GrantId, GrantSubject, type OrgId, type UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"
import { subjectKey, type SubjectKey } from "./subjects"

const GrantRow = Schema.toCodecJson(
  Schema.Struct({ ...Grant.fields, subject: JsonColumn(GrantSubject), conditions: JsonColumn(GrantConditions) })
).pipe(Schema.decodeTo(Grant))
const encodeGrant = encodeRow(GrantRow)

/** The `grants` row for a new grant; shared with `ResourcesRepo.insert`, which writes a creator grant in the same batch. */
export const grantInsertRow = (grant: Grant) =>
  Effect.map(encodeGrant(grant), (encoded) => {
    const key = subjectKey(grant.subject)
    return { ...encoded, subjectType: key.type, subjectId: key.id, revokedBy: null }
  })

export class GrantsRepo extends Context.Service<GrantsRepo, {
  /** Unrevoked, unexpired grants. */
  readonly list: (orgId: OrgId, filter: GrantFilter) => Effect.Effect<ReadonlyArray<Grant>>
  readonly find: (orgId: OrgId, id: GrantId) => Effect.Effect<Option.Option<Grant>>
  readonly insert: (grant: Grant) => Effect.Effect<void>
  readonly revoke: (orgId: OrgId, id: GrantId, by: UserId) => Effect.Effect<boolean>
  /** Every grant to a user, revoked and expired ones included. */
  readonly directUserGrants: (orgId: OrgId) => Effect.Effect<ReadonlyArray<Grant>>
  /** Unrevoked grants to any of `subjects`; expiry and scoping are applied by the resolver. */
  readonly forSubjects: (orgId: OrgId, subjects: ReadonlyArray<SubjectKey>) => Effect.Effect<ReadonlyArray<Grant>>
}>()("api/access/GrantsRepo") {
  static readonly layer = Layer.effect(
    GrantsRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT id, org_id, subject, resource_id, action, conditions, expires_at, created_by, created_at, revoked_at
                           FROM grants`
      const rows = decodeRows(GrantRow)

      return GrantsRepo.of({
        list: Effect.fn("GrantsRepo.list")(function*(orgId: OrgId, filter: GrantFilter) {
          const now = DateTime.formatIso(yield* DateTime.now)
          const clauses = [
            sql`org_id = ${orgId}`,
            sql`revoked_at IS NULL`,
            sql`(expires_at IS NULL OR expires_at > ${now})`,
            ...(filter.resourceId === undefined ? [] : [sql`resource_id = ${filter.resourceId}`]),
            ...(filter.subjectId === undefined ? [] : [sql`subject_id = ${filter.subjectId}`])
          ]
          return yield* rows(sql`${select} WHERE ${sql.and(clauses)} ORDER BY created_at DESC`)
        }),
        find: Effect.fn("GrantsRepo.find")((orgId: OrgId, id: GrantId) =>
          decodeFirst(GrantRow)(sql`${select} WHERE org_id = ${orgId} AND id = ${id}`)
        ),
        insert: Effect.fn("GrantsRepo.insert")(function*(grant: Grant) {
          yield* sql`INSERT INTO grants ${sql.insert(yield* grantInsertRow(grant))}`.pipe(Effect.orDie)
        }),
        revoke: Effect.fn("GrantsRepo.revoke")(function*(orgId: OrgId, id: GrantId, by: UserId) {
          const now = DateTime.formatIso(yield* DateTime.now)
          const revoked = yield* sql`UPDATE grants SET revoked_at = ${now}, revoked_by = ${by}
                                      WHERE org_id = ${orgId} AND id = ${id} AND revoked_at IS NULL RETURNING id`.pipe(Effect.orDie)
          return revoked.length > 0
        }),
        directUserGrants: Effect.fn("GrantsRepo.directUserGrants")((orgId: OrgId) =>
          rows(sql`${select} WHERE org_id = ${orgId} AND subject_type = 'user'`)
        ),
        forSubjects: Effect.fn("GrantsRepo.forSubjects")((orgId: OrgId, subjects: ReadonlyArray<SubjectKey>) => {
          const matches = subjects.map((subject) => sql`(subject_type = ${subject.type} AND subject_id = ${subject.id})`)
          return subjects.length === 0
            ? Effect.succeed([])
            : rows(sql`${select} WHERE org_id = ${orgId} AND revoked_at IS NULL AND ${sql.or(matches)}`)
        })
      })
    })
  )
}

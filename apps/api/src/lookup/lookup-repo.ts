import type { EntityKind, LookupEntry, OrgId } from "@pc/domain"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { SqlError } from "effect/sql/SqlError"
import { decodeRows } from "../platform/sql"

const LabelRow = Schema.Struct({ id: Schema.String, label: Schema.String, detail: Schema.NullOr(Schema.String), gone: Schema.Number })

/** D1 allows 100 bound parameters per statement; one is the org id. */
const IdsPerQuery = 90

/** Display names straight from D1, always scoped to one org. Kinds without a sensible name are not listed. */
export class LookupRepo extends Context.Service<LookupRepo, {
  readonly labels: (orgId: OrgId, kind: EntityKind, ids: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<LookupEntry>>
}>()("api/lookup/LookupRepo") {
  static readonly layer = Layer.effect(
    LookupRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      type Query = (orgId: OrgId, ids: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<unknown>, SqlError>
      const queries: Partial<Record<EntityKind, Query>> = {
        org: (orgId, ids) => sql`SELECT id, name AS label, slug AS detail, 0 AS gone FROM orgs WHERE id = ${orgId} AND ${sql.in("id", ids)}`,
        user: (orgId, ids) =>
          sql`SELECT u.id, COALESCE(u.name, u.email) AS label, u.email AS detail, m.status = 'deprovisioned' AS gone
                FROM users u JOIN memberships m ON m.user_id = u.id AND m.org_id = ${orgId} WHERE ${sql.in("u.id", ids)}`,
        member: (orgId, ids) =>
          sql`SELECT m.id, COALESCE(u.name, u.email, m.email) AS label, COALESCE(u.email, m.email) AS detail,
                     m.status = 'deprovisioned' AS gone
                FROM memberships m LEFT JOIN users u ON u.id = m.user_id WHERE m.org_id = ${orgId} AND ${sql.in("m.id", ids)}`,
        role: (orgId, ids) => sql`SELECT slug AS id, name AS label, NULL AS detail, 0 AS gone FROM roles WHERE org_id = ${orgId} AND ${sql.in("slug", ids)}`,
        team: (orgId, ids) => sql`SELECT id, name AS label, slug AS detail, 0 AS gone FROM teams WHERE org_id = ${orgId} AND ${sql.in("id", ids)}`,
        project: (orgId, ids) =>
          sql`SELECT id, name AS label, slug AS detail, archived_at IS NOT NULL AS gone FROM projects WHERE org_id = ${orgId} AND ${sql.in("id", ids)}`,
        resource: (orgId, ids) =>
          sql`SELECT id, name AS label, kind AS detail, deleted_at IS NOT NULL AS gone FROM resources WHERE org_id = ${orgId} AND ${sql.in("id", ids)}`,
        guard: (orgId, ids) =>
          sql`SELECT id, name AS label, mode AS detail, status = 'disabled' AS gone FROM guards WHERE org_id = ${orgId} AND ${sql.in("id", ids)}`,
        // Machine tokens (`mtk_` ids) are tokens too: audit targets name them with the `token` kind.
        token: (orgId, ids) => {
          const machine = ids.filter((id) => id.startsWith("mtk_"))
          const access = ids.filter((id) => !id.startsWith("mtk_"))
          const accessRows = access.length === 0 ? Effect.succeed([]) : sql`SELECT id, name AS label, kind AS detail, revoked_at IS NOT NULL AS gone
                                    FROM access_tokens WHERE org_id = ${orgId} AND ${sql.in("id", access)}`
          const machineRows = machine.length === 0 ? Effect.succeed([]) : sql`SELECT id, name AS label, 'machine' AS detail, revoked_at IS NOT NULL AS gone
                                    FROM machine_tokens WHERE org_id = ${orgId} AND ${sql.in("id", machine)}`
          return Effect.zipWith(accessRows, machineRows, (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>) => [...a, ...b])
        },
        approval: (orgId, ids) =>
          sql`SELECT id, json_extract(request, '$.tool') AS label, status AS detail, status != 'pending' AS gone
                FROM approvals WHERE org_id = ${orgId} AND ${sql.in("id", ids)}`,
        access_review: (orgId, ids) =>
          sql`SELECT id, name AS label, status AS detail, 0 AS gone FROM access_reviews WHERE org_id = ${orgId} AND ${sql.in("id", ids)}`
      }

      return LookupRepo.of({
        labels: Effect.fn("LookupRepo.labels")(function*(orgId: OrgId, kind: EntityKind, ids: ReadonlyArray<string>) {
          const query = queries[kind]
          if (query === undefined || ids.length === 0) return []
          const chunks = Array.from({ length: Math.ceil(ids.length / IdsPerQuery) }, (_, i) => ids.slice(i * IdsPerQuery, (i + 1) * IdsPerQuery))
          const rows = yield* Effect.forEach(chunks, (chunk) => decodeRows(LabelRow)(query(orgId, chunk)))
          return rows.flat().map((row): LookupEntry => ({ kind, id: row.id, label: row.label, detail: row.detail, gone: row.gone !== 0 }))
        })
      })
    })
  )
}

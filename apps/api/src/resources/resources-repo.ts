import {
  type AccountMode,
  type Conflict,
  type Grant,
  type OrgId,
  Resource,
  ResourceConfig,
  type ResourceFilter,
  type ResourceId,
  type ResourceKind,
  type UserId
} from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { grantInsertRow } from "../access/grants-repo"
import { conflictOnDuplicate, decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"

const ResourceRow = Schema.toCodecJson(Schema.Struct({ ...Resource.fields, config: JsonColumn(ResourceConfig) })).pipe(
  Schema.decodeTo(Resource)
)
const encodeResource = encodeRow(ResourceRow)

/** Resources are soft-deleted so grants, guards and audit events keep resolving their ids. */
export class ResourcesRepo extends Context.Service<ResourcesRepo, {
  readonly list: (orgId: OrgId, filter: ResourceFilter) => Effect.Effect<ReadonlyArray<Resource>>
  readonly find: (orgId: OrgId, id: ResourceId) => Effect.Effect<Option.Option<Resource>>
  readonly findMany: (orgId: OrgId, ids: ReadonlyArray<ResourceId>) => Effect.Effect<ReadonlyArray<Resource>>
  readonly ofKind: (orgId: OrgId, kind: ResourceKind) => Effect.Effect<ReadonlyArray<Resource>>
  /** Inserts the resource and, in the same batch, `grants` on it (its creator's), so neither exists without the other. */
  readonly insert: (resource: Resource, grants?: ReadonlyArray<Grant>) => Effect.Effect<void, Conflict>
  readonly update: (resource: Resource) => Effect.Effect<void, Conflict>
  /** Soft-deletes the resource, revokes every grant on it and deletes its connected accounts, atomically. */
  readonly remove: (orgId: OrgId, id: ResourceId, by: UserId) => Effect.Effect<void>
  /**
   * Saves `next` (a new account mode) and, in the same batch, deletes the connected accounts of `previous`
   * mode and soft-deletes `retiredSecret` (a shared OAuth2 integration's token secret) with its grants.
   */
  readonly switchAccountMode: (next: Resource, previous: AccountMode, retiredSecret: ResourceId | null, by: string) => Effect.Effect<void>
}>()("api/resources/ResourcesRepo") {
  static readonly layer = Layer.effect(
    ResourcesRepo,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const select = sql`SELECT id, org_id, project_id, name, description, config, created_by, created_at, updated_at FROM resources`
      const live = sql`deleted_at IS NULL`
      const rows = decodeRows(ResourceRow)
      const duplicate = conflictOnDuplicate("a resource of this kind with this name already exists")

      return ResourcesRepo.of({
        list: Effect.fn("ResourcesRepo.list")((orgId: OrgId, filter: ResourceFilter) => {
          const clauses = [
            sql`org_id = ${orgId}`,
            live,
            ...(filter.kind === undefined ? [] : [sql`kind = ${filter.kind}`]),
            ...(filter.projectId === undefined ? [] : [sql`project_id = ${filter.projectId}`])
          ]
          return rows(sql`${select} WHERE ${sql.and(clauses)} ORDER BY kind, name`)
        }),
        find: Effect.fn("ResourcesRepo.find")((orgId: OrgId, id: ResourceId) =>
          decodeFirst(ResourceRow)(sql`${select} WHERE org_id = ${orgId} AND id = ${id} AND ${live}`)
        ),
        findMany: Effect.fn("ResourcesRepo.findMany")((orgId: OrgId, ids: ReadonlyArray<ResourceId>) =>
          ids.length === 0 ? Effect.succeed([]) : rows(sql`${select} WHERE org_id = ${orgId} AND ${sql.in("id", ids)} AND ${live}`)
        ),
        ofKind: Effect.fn("ResourcesRepo.ofKind")((orgId: OrgId, kind: ResourceKind) =>
          rows(sql`${select} WHERE org_id = ${orgId} AND kind = ${kind} AND ${live}`)
        ),
        insert: Effect.fn("ResourcesRepo.insert")(function*(resource: Resource, grants: ReadonlyArray<Grant> = []) {
          const row = { ...(yield* encodeResource(resource)), kind: resource.config.kind, deletedAt: null }
          const grantRows = yield* Effect.forEach(grants, grantInsertRow)
          yield* sql.batch([
            sql`INSERT INTO resources ${sql.insert(row)}`,
            ...grantRows.map((grant) => sql`INSERT INTO grants ${sql.insert(grant)}`)
          ]).pipe(duplicate)
        }),
        update: Effect.fn("ResourcesRepo.update")(function*(resource: Resource) {
          const { id: _id, orgId: _orgId, createdBy: _createdBy, createdAt: _createdAt, ...changes } = yield* encodeResource(resource)
          yield* sql`UPDATE resources SET ${sql.update(changes)} WHERE id = ${resource.id} AND org_id = ${resource.orgId}`.pipe(duplicate)
        }),
        remove: Effect.fn("ResourcesRepo.remove")(function*(orgId: OrgId, id: ResourceId, by: UserId) {
          const now = DateTime.formatIso(yield* DateTime.now)
          yield* sql.batch([
            sql`UPDATE resources SET deleted_at = ${now} WHERE id = ${id} AND org_id = ${orgId}`,
            sql`UPDATE grants SET revoked_at = ${now}, revoked_by = ${by}
                 WHERE resource_id = ${id} AND org_id = ${orgId} AND revoked_at IS NULL`,
            // Connected accounts hold credentials for this resource only; none may outlive it.
            sql`DELETE FROM connections WHERE resource_id = ${id} AND org_id = ${orgId}`
          ]).pipe(Effect.orDie)
        }),
        switchAccountMode: Effect.fn("ResourcesRepo.switchAccountMode")(function*(next: Resource, previous: AccountMode, retiredSecret: ResourceId | null, by: string) {
          const { id: _id, orgId: _orgId, createdBy: _createdBy, createdAt: _createdAt, ...changes } = yield* encodeResource(next)
          const now = DateTime.formatIso(yield* DateTime.now)
          const { orgId, id } = next
          yield* sql.batch([
            sql`UPDATE resources SET ${sql.update(changes)} WHERE id = ${id} AND org_id = ${orgId}`,
            sql`DELETE FROM connections WHERE resource_id = ${id} AND org_id = ${orgId} AND mode = ${previous}`,
            ...(retiredSecret === null ? [] : [
              sql`UPDATE resources SET deleted_at = ${now} WHERE id = ${retiredSecret} AND org_id = ${orgId} AND kind = 'secret'`,
              sql`UPDATE grants SET revoked_at = ${now}, revoked_by = ${by}
                   WHERE resource_id = ${retiredSecret} AND org_id = ${orgId} AND revoked_at IS NULL`
            ])
          ]).pipe(Effect.orDie)
        })
      })
    })
  )
}


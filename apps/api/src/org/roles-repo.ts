import { type Conflict, type CreateRole, OrgPermission, type OrgId, Role, type RoleSlug, type UpdateRole } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { conflictOnDuplicate, decodeFirst, decodeRows, JsonColumn } from "../platform/sql"

const RoleRow = Schema.toCodecJson(
  Schema.Struct({ ...Role.fields, permissions: JsonColumn(Schema.Array(OrgPermission)), builtin: Schema.BooleanFromBit })
).pipe(Schema.decodeTo(Role))

/** Custom roles only; builtin roles come from `@pc/domain`. */
export class RolesRepo extends Context.Service<RolesRepo, {
  readonly list: (orgId: OrgId) => Effect.Effect<ReadonlyArray<Role>>
  readonly find: (orgId: OrgId, slug: RoleSlug) => Effect.Effect<Option.Option<Role>>
  readonly insert: (orgId: OrgId, role: CreateRole) => Effect.Effect<void, Conflict>
  readonly update: (orgId: OrgId, slug: RoleSlug, changes: UpdateRole) => Effect.Effect<void>
  readonly remove: (orgId: OrgId, slug: RoleSlug) => Effect.Effect<void>
}>()("api/org/RolesRepo") {
  static readonly layer = Layer.effect(
    RolesRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT slug, name, description, permissions, 0 AS builtin FROM roles`
      return RolesRepo.of({
        list: Effect.fn("RolesRepo.list")((orgId: OrgId) =>
          decodeRows(RoleRow)(sql`${select} WHERE org_id = ${orgId} ORDER BY slug`)
        ),
        find: Effect.fn("RolesRepo.find")((orgId: OrgId, slug: RoleSlug) =>
          decodeFirst(RoleRow)(sql`${select} WHERE org_id = ${orgId} AND slug = ${slug}`)
        ),
        insert: Effect.fn("RolesRepo.insert")(function*(orgId: OrgId, role: CreateRole) {
          const createdAt = DateTime.formatIso(yield* DateTime.now)
          const row = { orgId, ...role, permissions: JSON.stringify(role.permissions), createdAt }
          yield* sql`INSERT INTO roles ${sql.insert(row)}`.pipe(conflictOnDuplicate(`role ${role.slug} already exists`))
        }),
        update: Effect.fn("RolesRepo.update")((orgId: OrgId, slug: RoleSlug, changes: UpdateRole) =>
          sql`UPDATE roles SET name = COALESCE(${changes.name ?? null}, name),
                     description = COALESCE(${changes.description ?? null}, description),
                     permissions = COALESCE(${changes.permissions ? JSON.stringify(changes.permissions) : null}, permissions)
               WHERE org_id = ${orgId} AND slug = ${slug}`.pipe(Effect.asVoid, Effect.orDie)
        ),
        remove: Effect.fn("RolesRepo.remove")((orgId: OrgId, slug: RoleSlug) =>
          sql`DELETE FROM roles WHERE org_id = ${orgId} AND slug = ${slug}`.pipe(Effect.asVoid, Effect.orDie)
        )
      })
    })
  )
}

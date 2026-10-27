import { type Conflict, Org, OrgId, type UpdateOrg } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { conflictOnDuplicate, decodeFirst, encodeRow } from "../platform/sql"

const OrgRow = Schema.toCodecJson(Org)
const WorkosOrg = Schema.Struct({ workosOrgId: Schema.String })

export class OrgsRepo extends Context.Service<OrgsRepo, {
  readonly find: (id: OrgId) => Effect.Effect<Option.Option<Org>>
  readonly findByWorkosId: (workosOrgId: string) => Effect.Effect<Option.Option<Org>>
  readonly workosIdOf: (id: OrgId) => Effect.Effect<Option.Option<string>>
  readonly insert: (org: Org, workosOrgId: string) => Effect.Effect<void, Conflict>
  readonly update: (id: OrgId, patch: UpdateOrg) => Effect.Effect<void>
}>()("api/org/OrgsRepo") {
  static readonly layer = Layer.effect(
    OrgsRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const one = decodeFirst(OrgRow)
      const columns = sql`id, name, slug, audit_retention_days, tool_search_threshold, created_at`
      return OrgsRepo.of({
        find: Effect.fn("OrgsRepo.find")((id: OrgId) => one(sql`SELECT ${columns} FROM orgs WHERE id = ${id}`)),
        findByWorkosId: Effect.fn("OrgsRepo.findByWorkosId")((workosOrgId: string) =>
          one(sql`SELECT ${columns} FROM orgs WHERE workos_org_id = ${workosOrgId}`)
        ),
        workosIdOf: Effect.fn("OrgsRepo.workosIdOf")((id: OrgId) =>
          decodeFirst(WorkosOrg)(sql`SELECT workos_org_id FROM orgs WHERE id = ${id}`).pipe(
            Effect.map(Option.map((row) => row.workosOrgId))
          )
        ),
        insert: Effect.fn("OrgsRepo.insert")(function*(org: Org, workosOrgId: string) {
          const row = yield* encodeRow(OrgRow)(org)
          yield* sql`INSERT INTO orgs ${sql.insert({ ...row, workosOrgId })}`.pipe(conflictOnDuplicate("organization already exists"))
        }),
        update: Effect.fn("OrgsRepo.update")((id: OrgId, patch: UpdateOrg) =>
          Object.keys(patch).length === 0
            ? Effect.void
            : sql`UPDATE orgs SET ${sql.update(patch)} WHERE id = ${id}`.pipe(Effect.asVoid, Effect.orDie)
        )
      })
    })
  )
}


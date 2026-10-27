import { UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { Ids } from "../platform/ids"
import { decodeFirst, decodeRows } from "../platform/sql"
import { displayName, type WorkosUser } from "./workos"

const IdRow = Schema.Struct({ id: UserId })
const UserRow = Schema.Struct({ id: UserId, email: Schema.String, status: Schema.Literals(["active", "deprovisioned"]) })
export type UserRecord = typeof UserRow.Type

/** Local mirror of WorkOS users, keyed by our `UserId`. Rows are never deleted. */
export class UsersRepo extends Context.Service<UsersRepo, {
  /** JIT mirroring on sign-in: inserts or refreshes the user and returns our id. */
  readonly upsert: (user: WorkosUser) => Effect.Effect<UserId>
  readonly findByWorkosId: (workosUserId: string) => Effect.Effect<Option.Option<UserRecord>>
  readonly findByEmail: (email: string) => Effect.Effect<ReadonlyArray<UserId>>
  readonly workosIdOf: (id: UserId) => Effect.Effect<Option.Option<string>>
  readonly markDeprovisioned: (id: UserId) => Effect.Effect<void>
}>()("api/auth/UsersRepo") {
  static readonly layer = Layer.effect(
    UsersRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const one = decodeFirst(IdRow)

      const upsert = Effect.fn("UsersRepo.upsert")(function*(user: WorkosUser) {
        const now = DateTime.formatIso(yield* DateTime.now)
        const row = {
          id: yield* Ids.user,
          workosUserId: user.id,
          email: user.email,
          name: displayName(user),
          status: "active",
          lastSeenAt: now,
          createdAt: now
        }
        const stored = yield* one(
          sql`INSERT INTO users ${sql.insert(row)}
              ON CONFLICT(workos_user_id) DO UPDATE SET email = excluded.email, name = excluded.name, last_seen_at = excluded.last_seen_at
              RETURNING id`
        )
        return (yield* Effect.fromOption(stored).pipe(Effect.orDie)).id
      })

      return UsersRepo.of({
        upsert,
        findByWorkosId: Effect.fn("UsersRepo.findByWorkosId")((workosUserId: string) =>
          decodeFirst(UserRow)(sql`SELECT id, email, status FROM users WHERE workos_user_id = ${workosUserId}`)
        ),
        findByEmail: Effect.fn("UsersRepo.findByEmail")((email: string) =>
          decodeRows(IdRow)(sql`SELECT id FROM users WHERE lower(email) = lower(${email})`).pipe(
            Effect.map((rows) => rows.map((row) => row.id))
          )
        ),
        workosIdOf: Effect.fn("UsersRepo.workosIdOf")((id: UserId) =>
          decodeFirst(Schema.Struct({ workosUserId: Schema.String }))(sql`SELECT workos_user_id FROM users WHERE id = ${id}`).pipe(
            Effect.map(Option.map((row) => row.workosUserId))
          )
        ),
        markDeprovisioned: Effect.fn("UsersRepo.markDeprovisioned")((id: UserId) =>
          sql`UPDATE users SET status = 'deprovisioned' WHERE id = ${id}`.pipe(Effect.asVoid, Effect.orDie)
        )
      })
    })
  )
}

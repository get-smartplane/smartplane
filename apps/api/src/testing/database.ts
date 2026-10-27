import { D1Client } from "@effect/sql-d1"
import { Effect, Layer } from "effect"
import { d1Options } from "../platform/database"
import { makeSqliteD1 } from "./sqlite-d1"

/**
 * A fresh migrated in-memory database per layer build. The fake implements only the D1 surface that
 * `@effect/sql-d1` calls, so it is handed over through `unknown` once, here, instead of re-declaring
 * every overload of the abstract `D1Database` class.
 */
export const TestDatabase = Layer.unwrap(
  Effect.sync(() => {
    const { fake } = makeSqliteD1()
    const db: unknown = fake
    return D1Client.layer({ db: db as D1Database, ...d1Options })
  })
)

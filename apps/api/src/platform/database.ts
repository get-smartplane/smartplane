import { D1Client } from "@effect/sql-d1"
import { Effect, Layer, String as Str } from "effect"
import { WorkerBindings } from "./bindings"

/** Rows come back camelCased and `sql.insert` / `sql(id)` identifiers go out snake_cased. */
export const d1Options = { transformResultNames: Str.snakeToCamel, transformQueryNames: Str.camelToSnake }

/** D1 as an Effect `SqlClient` (and `D1Client` for atomic batches). */
export const DatabaseLive = Layer.unwrap(
  Effect.gen(function*() {
    const bindings = yield* WorkerBindings
    return D1Client.layer({ db: bindings.DB, ...d1Options })
  })
).pipe(Layer.orDie)

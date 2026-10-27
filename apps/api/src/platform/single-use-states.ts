import { D1Client } from "@effect/sql-d1"
import { Clock, Context, Effect, Layer, Option, Schema } from "effect"
import { decodeFirst } from "./sql"

const Taken = Schema.Struct({ value: Schema.String, expiresAt: Schema.Number })

/**
 * Short-lived single-use values in D1 (`oauth_states`). `take` is one `DELETE ... RETURNING`, which D1 runs
 * on the primary, so of two concurrent takes of the same key exactly one gets the value. KV cannot promise
 * that: it is eventually consistent and edge-cached.
 */
export class SingleUseStore extends Context.Service<SingleUseStore, {
  readonly put: (key: string, value: string, ttlSeconds: number) => Effect.Effect<void>
  readonly take: (key: string) => Effect.Effect<Option.Option<string>>
}>()("api/platform/SingleUseStore") {
  static readonly layer = Layer.effect(
    SingleUseStore,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      return SingleUseStore.of({
        put: Effect.fn("SingleUseStore.put")(function*(key: string, value: string, ttlSeconds: number) {
          const now = yield* Clock.currentTimeMillis
          yield* sql.batch([
            sql`DELETE FROM oauth_states WHERE expires_at <= ${now}`,
            sql`INSERT INTO oauth_states (key, value, expires_at) VALUES (${key}, ${value}, ${now + ttlSeconds * 1000})`
          ]).pipe(Effect.orDie)
        }),
        take: Effect.fn("SingleUseStore.take")(function*(key: string) {
          const now = yield* Clock.currentTimeMillis
          // An expired row is deleted all the same, and not returned.
          const taken = yield* decodeFirst(Taken)(sql`DELETE FROM oauth_states WHERE key = ${key} RETURNING value, expires_at`)
          return Option.map(Option.filter(taken, (row) => row.expiresAt > now), (row) => row.value)
        })
      })
    })
  )
}

/**
 * Values keyed by an unguessable OAuth `state`, for `ttlSeconds`, encoded with `schema`. A state is single
 * use: taking it deletes it, so a replayed redirect finds nothing.
 */
export const singleUseStates = <S extends Schema.Top>(store: SingleUseStore["Service"], prefix: string, schema: S, ttlSeconds: number) => {
  const key = (state: string) => `${prefix}:${state}`
  const json = Schema.fromJsonString(Schema.toCodecJson(schema))
  return {
    put: (state: string, value: S["Type"]) =>
      Effect.flatMap(Effect.orDie(Schema.encodeEffect(json)(value)), (text) => store.put(key(state), text, ttlSeconds)),
    take: (state: string) =>
      Effect.flatMap(store.take(key(state)), Option.match({
        onNone: () => Effect.succeed(Option.none<S["Type"]>()),
        onSome: (text) => Effect.option(Schema.decodeUnknownEffect(json)(text))
      }))
  }
}

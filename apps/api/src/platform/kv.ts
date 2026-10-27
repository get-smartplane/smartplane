import { Context, Effect, Layer, Option, Schema } from "effect"
import { WorkerBindings } from "./bindings"

/** JSON values in Workers KV, decoded with a schema on the way out. A value that no longer decodes is a miss. */
export class KvCache extends Context.Service<KvCache, {
  readonly get: <S extends Schema.Top>(key: string, schema: S) => Effect.Effect<Option.Option<S["Type"]>, never, S["DecodingServices"]>
  readonly set: <S extends Schema.Top>(
    key: string,
    schema: S,
    value: S["Type"],
    ttlSeconds: number
  ) => Effect.Effect<void, never, S["EncodingServices"]>
  readonly remove: (key: string) => Effect.Effect<void>
}>()("api/platform/KvCache") {
  static readonly layer = Layer.effect(
    KvCache,
    Effect.gen(function*() {
      const kv = (yield* WorkerBindings).CACHE
      const json = <S extends Schema.Top>(schema: S) => Schema.fromJsonString(Schema.toCodecJson(schema))

      return KvCache.of({
        get: Effect.fn("KvCache.get")(function*<S extends Schema.Top>(key: string, schema: S) {
          const text = yield* Effect.promise(() => kv.get(key, "text"))
          if (text === null) return Option.none()
          return yield* Schema.decodeUnknownEffect(json(schema))(text).pipe(Effect.option)
        }),
        set: Effect.fn("KvCache.set")(function*<S extends Schema.Top>(key: string, schema: S, value: S["Type"], ttlSeconds: number) {
          const text = yield* Schema.encodeEffect(json(schema))(value).pipe(Effect.orDie)
          yield* Effect.promise(() => kv.put(key, text, { expirationTtl: ttlSeconds }))
        }),
        remove: Effect.fn("KvCache.remove")((key: string) => Effect.promise(() => kv.delete(key)))
      })
    })
  )
}

import type { BindingFailure } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { bindingCall, warn } from "./binding-call"
import { WorkerBindings } from "./bindings"

/**
 * JSON values in Workers KV, decoded with a schema on the way out. A value that no longer decodes is a miss.
 * KV failures (including its one-write-per-second-per-key limit) are `BindingFailure`s; callers decide.
 */
export class KvCache extends Context.Service<KvCache, {
  readonly get: <S extends Schema.Top>(key: string, schema: S) => Effect.Effect<Option.Option<S["Type"]>, BindingFailure, S["DecodingServices"]>
  readonly set: <S extends Schema.Top>(
    key: string,
    schema: S,
    value: S["Type"],
    ttlSeconds: number
  ) => Effect.Effect<void, BindingFailure, S["EncodingServices"]>
  readonly remove: (key: string) => Effect.Effect<void, BindingFailure>
}>()("api/platform/KvCache") {
  static readonly layer = Layer.effect(
    KvCache,
    Effect.gen(function*() {
      const kv = (yield* WorkerBindings).CACHE
      const json = <S extends Schema.Top>(schema: S) => Schema.fromJsonString(Schema.toCodecJson(schema))

      return KvCache.of({
        get: Effect.fn("KvCache.get")(function*<S extends Schema.Top>(key: string, schema: S) {
          const text = yield* bindingCall("CACHE", "get", () => kv.get(key, "text"))
          if (text === null) return Option.none()
          return yield* Schema.decodeUnknownEffect(json(schema))(text).pipe(Effect.option)
        }),
        set: Effect.fn("KvCache.set")(function*<S extends Schema.Top>(key: string, schema: S, value: S["Type"], ttlSeconds: number) {
          const text = yield* Schema.encodeEffect(json(schema))(value).pipe(Effect.orDie)
          yield* bindingCall("CACHE", "put", () => kv.put(key, text, { expirationTtl: ttlSeconds }))
        }),
        remove: Effect.fn("KvCache.remove")((key: string) => bindingCall("CACHE", "delete", () => kv.delete(key)))
      })
    })
  )
}

/** For pure caches: a failed read is a miss (logged), so the caller recomputes instead of failing. */
export const missOnFailure = <A, R>(read: Effect.Effect<Option.Option<A>, BindingFailure, R>): Effect.Effect<Option.Option<A>, never, R> =>
  Effect.catchTag(read, "BindingFailure", (failure) => Effect.as(warn("cache read", failure), Option.none<A>()))

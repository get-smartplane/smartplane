import { Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { AppConfig } from "../platform/config"
import { importKek, InvalidKek, type Kek } from "./envelope"

const PreviousKeks = Schema.fromJsonString(Schema.Record(Schema.NonEmptyString, Schema.NonEmptyString))
// The error names the variable only: a schema error would echo key material.
const decodePrevious = (raw: Redacted.Redacted<string> | undefined) =>
  raw === undefined || Redacted.value(raw).trim() === ""
    ? Effect.succeed({})
    : Schema.decodeUnknownEffect(PreviousKeks)(Redacted.value(raw)).pipe(
      Effect.mapError(() => new InvalidKek({ kekId: "SECRETS_PREVIOUS_KEKS" }))
    )

/**
 * Key-encryption keys from Workers secrets: `current` seals new versions and is the re-wrap target;
 * `previous` KEKs only open data keys that have not been re-wrapped yet. A bad KEK is a deployment
 * defect, so it dies at startup.
 */
export class KeyRing extends Context.Service<KeyRing, {
  readonly current: Kek
  readonly previous: ReadonlyArray<Kek>
  readonly find: (kekId: string) => Option.Option<Kek>
}>()("api/secrets/KeyRing") {
  static readonly make = (current: Kek, previous: ReadonlyArray<Kek> = []) => {
    const retired = previous.filter((kek) => kek.id !== current.id)
    const byId = new Map([...retired, current].map((kek) => [kek.id, kek]))
    return KeyRing.of({ current, previous: retired, find: (kekId) => Option.fromUndefinedOr(byId.get(kekId)) })
  }

  static readonly layer = Layer.effect(
    KeyRing,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const current = yield* importKek(config.SECRETS_KEK_ID, config.SECRETS_KEK)
      const previous = yield* Effect.forEach(
        Object.entries(yield* decodePrevious(config.SECRETS_PREVIOUS_KEKS)),
        ([id, key]) => importKek(id, Redacted.make(key))
      )
      return KeyRing.make(current, previous)
    }).pipe(Effect.orDie)
  )
}

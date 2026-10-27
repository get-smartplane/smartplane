import { assert, describe, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { toBase64 } from "../platform/encoding"
import { importKek, open, seal } from "./envelope"

const randomKek = (id: string) => importKek(id, Redacted.make(toBase64(crypto.getRandomValues(new Uint8Array(32)))))

describe("envelope encryption", () => {
  it.effect("round-trips a secret and never stores the plaintext", () =>
    Effect.gen(function*() {
      const kek = yield* randomKek("kek-1")
      const envelope = yield* seal(kek, Redacted.make("sk_live_123"))
      assert.notInclude(JSON.stringify(envelope), "sk_live_123")
      assert.strictEqual(envelope.kekId, "kek-1")
      const plaintext = yield* open(kek, envelope)
      assert.strictEqual(Redacted.value(plaintext), "sk_live_123")
      assert.notInclude(String(plaintext), "sk_live_123")
    }))

  it.effect("uses a fresh data key and IV per version", () =>
    Effect.gen(function*() {
      const kek = yield* randomKek("kek-1")
      const a = yield* seal(kek, Redacted.make("same"))
      const b = yield* seal(kek, Redacted.make("same"))
      assert.notStrictEqual(a.ciphertext, b.ciphertext)
      assert.notStrictEqual(a.wrappedDek, b.wrappedDek)
    }))

  it.effect("fails with DecryptionFailed under the wrong KEK", () =>
    Effect.gen(function*() {
      const envelope = yield* seal(yield* randomKek("kek-1"), Redacted.make("secret"))
      const sameIdOtherKey = yield* open(yield* randomKek("kek-1"), envelope).pipe(Effect.flip)
      assert.strictEqual(sameIdOtherKey._tag, "DecryptionFailed")
      const otherId = yield* open(yield* randomKek("kek-2"), envelope).pipe(Effect.flip)
      assert.strictEqual(otherId._tag, "DecryptionFailed")
    }))

  it.effect("detects a tampered ciphertext", () =>
    Effect.gen(function*() {
      const kek = yield* randomKek("kek-1")
      const envelope = yield* seal(kek, Redacted.make("secret"))
      const flipped = envelope.ciphertext.startsWith("A") ? `B${envelope.ciphertext.slice(1)}` : `A${envelope.ciphertext.slice(1)}`
      const error = yield* open(kek, { ...envelope, ciphertext: flipped }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "DecryptionFailed")
    }))

  it.effect("rejects a KEK of the wrong length", () =>
    Effect.gen(function*() {
      const error = yield* importKek("bad", Redacted.make(toBase64(new Uint8Array(7)))).pipe(Effect.flip)
      assert.strictEqual(error._tag, "InvalidKek")
    }))
})

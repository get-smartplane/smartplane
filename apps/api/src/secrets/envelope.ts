import { Effect, Redacted, Schema } from "effect"
import { fromBase64, toBase64 } from "../platform/encoding"

/** What is stored per secret version. Every field is safe to persist; none reveals the plaintext. */
export const Envelope = Schema.Struct({
  ciphertext: Schema.String,
  iv: Schema.String,
  wrappedDek: Schema.String,
  kekId: Schema.String
})
export type Envelope = typeof Envelope.Type

export interface Kek {
  readonly id: string
  readonly key: CryptoKey
}

/** Wrong KEK, tampered ciphertext or a malformed KEK: indistinguishable on purpose. */
export class DecryptionFailed extends Schema.TaggedError<DecryptionFailed>()("DecryptionFailed", {
  kekId: Schema.String
}) {}

export class InvalidKek extends Schema.TaggedError<InvalidKek>()("InvalidKek", { kekId: Schema.String }) {}

export const importKek = (id: string, base64: Redacted.Redacted<string>): Effect.Effect<Kek, InvalidKek> =>
  Effect.tryPromise({
    try: () => crypto.subtle.importKey("raw", fromBase64(Redacted.value(base64)), "AES-KW", false, ["wrapKey", "unwrapKey"]),
    catch: () => new InvalidKek({ kekId: id })
  }).pipe(Effect.map((key) => ({ id, key })))

/**
 * Envelope encryption: a fresh AES-256-GCM data key per version, wrapped with the KEK (AES-KW). Rotating
 * the KEK only re-wraps data keys; plaintext never leaves this function unencrypted.
 */
export const seal = Effect.fn("Envelope.seal")(function*(kek: Kek, plaintext: Redacted.Redacted<string>) {
  return yield* Effect.promise(async (): Promise<Envelope> => {
    const dekBytes = crypto.getRandomValues(new Uint8Array(32))
    const dek = await crypto.subtle.importKey("raw", dekBytes, "AES-GCM", true, ["encrypt"])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(Redacted.value(plaintext))
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, encoded)
    const wrappedDek = await crypto.subtle.wrapKey("raw", dek, kek.key, "AES-KW")
    return { ciphertext: toBase64(ciphertext), iv: toBase64(iv), wrappedDek: toBase64(wrappedDek), kekId: kek.id }
  })
})

export const open = Effect.fn("Envelope.open")(function*(kek: Kek, envelope: Envelope) {
  if (envelope.kekId !== kek.id) return yield* new DecryptionFailed({ kekId: envelope.kekId })
  const plaintext = yield* Effect.tryPromise({
    try: async () => {
      const dek = await crypto.subtle.unwrapKey(
        "raw",
        fromBase64(envelope.wrappedDek),
        kek.key,
        "AES-KW",
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      )
      const iv = fromBase64(envelope.iv)
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, dek, fromBase64(envelope.ciphertext)))
    },
    catch: () => new DecryptionFailed({ kekId: envelope.kekId })
  })
  return Redacted.make(plaintext)
})

/**
 * Moves an envelope's data key from `from` to `to` (KEK rotation). The ciphertext and IV are untouched and
 * the data key stays inside WebCrypto: it is unwrapped and re-wrapped, never exported as bytes to JS.
 */
export const rewrap = Effect.fn("Envelope.rewrap")(function*(from: Kek, to: Kek, envelope: Envelope) {
  if (envelope.kekId !== from.id) return yield* new DecryptionFailed({ kekId: envelope.kekId })
  const wrappedDek = yield* Effect.tryPromise({
    try: async () => {
      const aesGcm = { name: "AES-GCM", length: 256 }
      const dek = await crypto.subtle.unwrapKey("raw", fromBase64(envelope.wrappedDek), from.key, "AES-KW", aesGcm, true, ["decrypt"])
      return toBase64(await crypto.subtle.wrapKey("raw", dek, to.key, "AES-KW"))
    },
    catch: () => new DecryptionFailed({ kekId: envelope.kekId })
  })
  const rewrapped: Envelope = { ...envelope, wrappedDek, kekId: to.id }
  return rewrapped
})

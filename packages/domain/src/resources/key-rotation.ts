import { Schema } from "effect"

/**
 * Outcome of re-wrapping secret data keys under the current KEK. Ciphertext is untouched; only the wrapped
 * data key and its KEK id change. `remaining` counts versions still under another KEK (more batches to run,
 * or a KEK id no longer configured, which needs an operator).
 */
export class KeyRewrapResult extends Schema.Opaque<KeyRewrapResult>()(
  Schema.Struct({
    kekId: Schema.String,
    rewrapped: Schema.Int,
    remaining: Schema.Int
  }).annotate({ identifier: "KeyRewrapResult" })
) {}

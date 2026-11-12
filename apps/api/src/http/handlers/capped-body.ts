import { Effect } from "effect"

/** The body was larger than the cap; reading stopped there. */
export const TooLarge = Symbol("TooLarge")

/**
 * Reads a body stream up to `cap` bytes, cancelling the stream as soon as it passes the cap. Chunked bodies
 * declare no length, so this running count is what bounds memory, not the Content-Length check.
 */
export const readCapped = (body: ReadableStream<Uint8Array> | null, cap: number): Effect.Effect<Uint8Array | typeof TooLarge, unknown> =>
  Effect.tryPromise({
    try: async () => {
      if (body === null) return new Uint8Array()
      const reader = body.getReader()
      const chunks: Array<Uint8Array> = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > cap) {
          await reader.cancel()
          return TooLarge
        }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size)
      chunks.reduce((offset, chunk) => (bytes.set(chunk, offset), offset + chunk.byteLength), 0)
      return bytes
    },
    catch: (cause) => cause
  })

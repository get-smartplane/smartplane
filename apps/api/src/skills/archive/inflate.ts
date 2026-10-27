import type { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import { rejected } from "./limits"

type Format = "gzip" | "deflate-raw"

const SliceBytes = 64 * 1024

/** Bytes as a pull stream of views (no copy), so a decoder only takes what it needs. */
export const sliced = (bytes: Uint8Array): ReadableStream<Uint8Array> => {
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.subarray(offset, offset + SliceBytes))
      offset += SliceBytes
    }
  })
}

const concat = (chunks: ReadonlyArray<Uint8Array>, size: number): Uint8Array => {
  const out = new Uint8Array(size)
  chunks.reduce((offset, chunk) => (out.set(chunk, offset), offset + chunk.length), 0)
  return out
}

/**
 * Decompresses with the platform's streaming decoder and stops as soon as the output passes `cap`, so a
 * zip bomb costs at most `cap` bytes of memory rather than its declared (or real) expanded size.
 */
export const inflate = (bytes: Uint8Array, format: Format, cap: number): Effect.Effect<Uint8Array, InvalidInput> =>
  Effect.tryPromise({
    try: async () => {
      const reader = sliced(bytes).pipeThrough(new DecompressionStream(format)).getReader()
      const chunks: Array<Uint8Array> = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return { size, data: concat(chunks, size) }
        size += value.length
        if (size > cap) {
          await reader.cancel()
          return { size, data: undefined }
        }
        chunks.push(value)
      }
    },
    catch: () => rejected(`the ${format === "gzip" ? "gzip stream" : "zip entry"} is corrupt`)
  }).pipe(
    Effect.flatMap(({ data }) => (data === undefined ? Effect.fail(rejected(`the archive expands beyond ${cap} bytes`)) : Effect.succeed(data)))
  )

/** gzip for bundle downloads. */
export const gzip = (bytes: Uint8Array): Effect.Effect<Uint8Array> =>
  Effect.promise(async () => new Uint8Array(await new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()))

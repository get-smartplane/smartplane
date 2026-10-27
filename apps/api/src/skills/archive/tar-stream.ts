import type { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import { sliced } from "./inflate"
import { rejected } from "./limits"
import type { RawEntry } from "./tar"
import { tarParser, type TarParserOptions } from "./tar-parser"

type Outcome = { readonly refused: InvalidInput } | { readonly entries: ReadonlyArray<RawEntry> }

/**
 * Gunzips and parses a .tar.gz chunk by chunk. Peak memory is the decoder's window plus the kept entries
 * (bounded by `maxKeptBytes`), never the expanded archive; reading stops as soon as the expanded size
 * passes `maxExpandedBytes`, a cap is hit, or the end-of-archive block arrives.
 */
export const streamTarGz = (
  bytes: Uint8Array,
  options: TarParserOptions & { readonly maxExpandedBytes: number; readonly overExpanded: () => InvalidInput }
): Effect.Effect<ReadonlyArray<RawEntry>, InvalidInput> =>
  Effect.tryPromise({
    try: async (): Promise<Outcome> => {
      const parser = tarParser(options)
      const reader = sliced(bytes).pipeThrough(new DecompressionStream("gzip")).getReader()
      let expanded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          const refused = parser.finish()
          return refused === undefined ? { entries: parser.entries() } : { refused }
        }
        expanded += value.length
        const refused = expanded > options.maxExpandedBytes ? options.overExpanded() : parser.push(value)
        if (refused !== undefined || parser.done()) {
          await reader.cancel()
          return refused === undefined ? { entries: parser.entries() } : { refused }
        }
      }
    },
    catch: () => rejected("the gzip stream is corrupt")
  }).pipe(Effect.flatMap((outcome) => ("refused" in outcome ? Effect.fail(outcome.refused) : Effect.succeed(outcome.entries))))

import type { InvalidInput } from "@pc/domain"
import { rejected } from "./limits"
import type { RawEntry } from "./tar"

const Block = 512
/** Pax `x` and GNU `L` records only carry a path; anything larger is not one we would accept anyway. */
const MaxMetaBytes = 64 * 1024
const decoder = new TextDecoder()

const text = (block: Uint8Array, offset: number, length: number): string => {
  const field = block.subarray(offset, offset + length)
  const end = field.indexOf(0)
  return decoder.decode(end === -1 ? field : field.subarray(0, end))
}

const octal = (block: Uint8Array, offset: number, length: number): number => {
  const value = text(block, offset, length).trim()
  return value === "" ? 0 : Number.parseInt(value, 8)
}

/** `path=` records of a pax extended header (`<len> <key>=<value>\n`). */
const paxPath = (data: Uint8Array): string | undefined => {
  for (const record of decoder.decode(data).split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(record)
    if (match?.[1] !== undefined) return match[1]
  }
  return undefined
}

const kindOf = (type: string): RawEntry["kind"] => {
  if (type === "0" || type === "\0" || type === "" || type === "7") return "file"
  if (type === "5") return "dir"
  if (type === "1" || type === "2") return "link"
  return "other"
}

export interface TarParserOptions {
  /** Whether to hold on to an entry's bytes; the others are skipped as they stream past. */
  readonly keep: (entry: Pick<RawEntry, "name" | "kind" | "size">) => boolean
  /** Total bytes of kept entries; one more fails with `overKept` before anything is allocated for it. */
  readonly maxKeptBytes: number
  readonly overKept: () => InvalidInput
  readonly maxEntries: number
}

interface Current {
  readonly type: string
  readonly header: Omit<RawEntry, "data">
  readonly data: Uint8Array | undefined
  filled: number
}

/**
 * An incremental ustar/pax/GNU tar reader: `push` chunks as they arrive (any size), `finish` at the end.
 * Only kept entries' bytes are held, so memory is bounded by `maxKeptBytes`, not by the archive. Long
 * names from pax `x` and GNU `L` headers apply to the next entry; pax global headers are skipped.
 */
export const tarParser = (options: TarParserOptions) => {
  const entries: Array<RawEntry> = []
  const header = new Uint8Array(Block)
  let headerFill = 0
  let current: Current | undefined
  let remaining = 0
  let padding = 0
  let longName: string | undefined
  let kept = 0
  let ended = false

  const startEntry = (): InvalidInput | undefined => {
    if (header.every((byte) => byte === 0)) {
      ended = true
      return undefined
    }
    const size = octal(header, 124, 12)
    if (!Number.isSafeInteger(size) || size < 0) return rejected("the tar archive is truncated or corrupt")
    const type = text(header, 156, 1)
    remaining = size
    padding = (Block - (size % Block)) % Block
    if (type === "x" || type === "L") {
      if (size > MaxMetaBytes) return rejected("a tar extended header is too large")
      current = { type, header: { name: "", kind: "other", mode: 0, size }, data: new Uint8Array(size), filled: 0 }
    } else if (type === "g") {
      current = { type, header: { name: "", kind: "other", mode: 0, size }, data: undefined, filled: 0 }
    } else {
      const shortName = text(header, 0, 100)
      const prefix = text(header, 257, 5) === "ustar" ? text(header, 345, 155) : ""
      const entry = { name: longName ?? (prefix === "" ? shortName : `${prefix}/${shortName}`), kind: kindOf(type), mode: octal(header, 100, 8), size }
      longName = undefined
      if (entries.length >= options.maxEntries) return rejected(`more than ${options.maxEntries} archive entries`)
      const keep = options.keep(entry)
      if (keep && kept + size > options.maxKeptBytes) return options.overKept()
      if (keep) kept += size
      current = { type, header: entry, data: keep ? new Uint8Array(size) : undefined, filled: 0 }
    }
    return remaining === 0 ? endEntry() : undefined
  }

  const endEntry = (): undefined => {
    if (current === undefined) return undefined
    const { type, data } = current
    if (type === "x") longName = (data === undefined ? undefined : paxPath(data)) ?? longName
    else if (type === "L") longName = data === undefined ? longName : text(data, 0, data.length)
    else if (type !== "g") entries.push({ ...current.header, data: data ?? new Uint8Array(0) })
    current = undefined
    return undefined
  }

  /** Feeds one chunk; returns a refusal, or undefined (check `done` to stop reading early). */
  const push = (chunk: Uint8Array): InvalidInput | undefined => {
    let offset = 0
    while (offset < chunk.length && !ended) {
      if (current !== undefined && remaining > 0) {
        const take = Math.min(remaining, chunk.length - offset)
        current.data?.set(chunk.subarray(offset, offset + take), current.filled)
        current.filled += take
        remaining -= take
        offset += take
        if (remaining === 0) endEntry()
      } else if (padding > 0) {
        const take = Math.min(padding, chunk.length - offset)
        padding -= take
        offset += take
      } else {
        const take = Math.min(Block - headerFill, chunk.length - offset)
        header.set(chunk.subarray(offset, offset + take), headerFill)
        headerFill += take
        offset += take
        if (headerFill === Block) {
          headerFill = 0
          const refused = startEntry()
          if (refused !== undefined) return refused
        }
      }
    }
    return undefined
  }

  /** A refusal if the archive stopped inside an entry. */
  const finish = (): InvalidInput | undefined => (current !== undefined && remaining > 0 ? rejected("the tar archive is truncated or corrupt") : undefined)

  return { push, finish, done: () => ended, entries: (): ReadonlyArray<RawEntry> => entries }
}

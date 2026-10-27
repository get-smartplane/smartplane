import type { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import { rejected } from "./limits"
import { tarParser } from "./tar-parser"

/**
 * An archive member before path checks: links and devices are reported so the caller can refuse them.
 * `data` is empty for entries a streaming read chose not to keep; `size` is always the real size.
 */
export interface RawEntry {
  readonly name: string
  readonly kind: "file" | "dir" | "link" | "other"
  readonly mode: number
  readonly size: number
  readonly data: Uint8Array
}

const Block = 512

/** Reads a whole (decompressed) tar held in memory; `streamTarGz` is the bounded path for large archives. */
export const readTar = (tar: Uint8Array): Effect.Effect<ReadonlyArray<RawEntry>, InvalidInput> =>
  Effect.suspend(() => {
    const truncated = () => rejected("the tar archive is truncated or corrupt")
    // Every entry takes at least a header block, and no entry can hold more than the input.
    const parser = tarParser({ keep: () => true, maxKeptBytes: tar.length, overKept: truncated, maxEntries: tar.length / Block })
    const refused = parser.push(tar) ?? parser.finish()
    return refused === undefined ? Effect.succeed(parser.entries()) : Effect.fail(refused)
  })

const encoder = new TextEncoder()

const header = (name: string, size: number, mode: string, type: string): Uint8Array => {
  const block = new Uint8Array(Block)
  const put = (value: string, offset: number) => block.set(encoder.encode(value), offset)
  put(name.slice(0, 100), 0)
  put(`0000${mode}\0`, 100)
  put("0000000\0", 108)
  put("0000000\0", 116)
  put(`${size.toString(8).padStart(11, "0")}\0`, 124)
  put("00000000000\0", 136)
  put(type, 156)
  put("ustar\0" + "00", 257)
  block.fill(32, 148, 156)
  const checksum = block.reduce((sum, byte) => sum + byte, 0)
  put(`${checksum.toString(8).padStart(6, "0")}\0 `, 148)
  return block
}

const padded = (data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(Math.ceil(data.length / Block) * Block)
  out.set(data)
  return out
}

const paxRecord = (path: string): Uint8Array => {
  const body = ` path=${path}\n`
  const size = encoder.encode(body).length
  // The record's length includes its own digits.
  const guess = size + String(size).length
  const length = size + String(guess).length
  return encoder.encode(`${length}${body}`)
}

/** A plain ustar archive (pax headers for long paths), deterministic: zero mtimes and owners. */
export const writeTar = (files: ReadonlyArray<{ readonly path: string; readonly mode: string; readonly bytes: Uint8Array }>): Uint8Array => {
  const parts: Array<Uint8Array> = []
  for (const file of files) {
    if (encoder.encode(file.path).length > 100) {
      const record = paxRecord(file.path)
      parts.push(header("PaxHeader", record.length, "644", "x"), padded(record))
    }
    parts.push(header(file.path, file.bytes.length, file.mode, "0"), padded(file.bytes))
  }
  parts.push(new Uint8Array(Block * 2))
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  parts.reduce((offset, part) => (out.set(part, offset), offset + part.length), 0)
  return out
}

import type { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import { inflate } from "./inflate"
import { type ArchiveLimits, rejected } from "./limits"
import type { RawEntry } from "./tar"

const EndOfDirectory = 0x06054b50
const DirectoryEntry = 0x02014b50
const LocalHeader = 0x04034b50
const UnixHost = 3
const decoder = new TextDecoder()

const findEnd = (view: DataView): number => {
  // The end record is 22 bytes plus a comment of up to 65535 bytes.
  for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 22 - 0xffff); offset--) {
    if (view.getUint32(offset, true) === EndOfDirectory) return offset
  }
  return -1
}

interface DirectoryRecord {
  readonly name: string
  readonly method: number
  readonly encrypted: boolean
  readonly compressedSize: number
  readonly size: number
  readonly unixMode: number | undefined
  readonly localOffset: number
}

const readDirectory = (view: DataView, bytes: Uint8Array): ReadonlyArray<DirectoryRecord> | string => {
  const end = findEnd(view)
  if (end === -1) return "not a zip archive"
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  if (count === 0xffff || offset === 0xffffffff) return "zip64 archives are not supported"
  const records: Array<DirectoryRecord> = []
  for (let index = 0; index < count; index++) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== DirectoryEntry) return "the zip directory is corrupt"
    const nameLength = view.getUint16(offset + 28, true)
    const external = view.getUint32(offset + 38, true)
    records.push({
      name: decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      encrypted: (view.getUint16(offset + 8, true) & 1) === 1,
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      unixMode: view.getUint8(offset + 5) === UnixHost ? external >>> 16 : undefined,
      localOffset: view.getUint32(offset + 42, true)
    })
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  return records
}

const kindOf = (record: DirectoryRecord): RawEntry["kind"] => {
  if (record.name.endsWith("/")) return "dir"
  const type = (record.unixMode ?? 0) & 0o170000
  if (type === 0o120000) return "link"
  return type === 0 || type === 0o100000 ? "file" : "other"
}

/**
 * Reads a zip through its central directory. Declared sizes are checked against the limits first, then each
 * entry is inflated with a cap of its declared size and must match it exactly: a header that lies about
 * its size (the zip-bomb trick) is refused after at most that many bytes.
 */
export const readZip = (bytes: Uint8Array, limits: ArchiveLimits): Effect.Effect<ReadonlyArray<RawEntry>, InvalidInput> =>
  Effect.gen(function*() {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const directory = readDirectory(view, bytes)
    if (typeof directory === "string") return yield* rejected(directory)
    if (directory.length > limits.maxFiles * 2) return yield* rejected(`more than ${limits.maxFiles} files`)
    const declared = directory.reduce((total, record) => total + record.size, 0)
    if (declared > limits.maxExpandedBytes) return yield* rejected(`the archive expands beyond ${limits.maxExpandedBytes} bytes`)
    const oversized = directory.find((record) => record.size > limits.maxFileBytes)
    if (oversized !== undefined) return yield* rejected(`"${oversized.name}" is larger than ${limits.maxFileBytes} bytes`)
    const entries: Array<RawEntry> = []
    for (const record of directory) {
      const kind = kindOf(record)
      if (kind !== "file") {
        entries.push({ name: record.name, kind, mode: record.unixMode ?? 0o644, size: 0, data: new Uint8Array(0) })
        continue
      }
      if (record.encrypted) return yield* rejected(`"${record.name}" is encrypted`)
      const local = record.localOffset
      if (local + 30 > bytes.length || view.getUint32(local, true) !== LocalHeader) return yield* rejected("the zip archive is corrupt")
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
      const compressed = bytes.subarray(start, start + record.compressedSize)
      if (compressed.length !== record.compressedSize) return yield* rejected("the zip archive is truncated")
      const data = record.method === 0
        ? compressed
        : record.method === 8
        ? yield* inflate(compressed, "deflate-raw", record.size)
        : yield* rejected(`"${record.name}" uses an unsupported compression method`)
      if (data.length !== record.size) return yield* rejected(`"${record.name}" does not match its declared size`)
      entries.push({ name: record.name, kind, mode: record.unixMode ?? 0o644, size: data.length, data })
    }
    return entries
  })

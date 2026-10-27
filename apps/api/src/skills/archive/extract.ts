import type { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import { isJunk, normaliseEntryPath } from "./entry-path"
import { type ArchiveFile, type ArchiveLimits, modeOf, rejected } from "./limits"
import { type RawEntry, readTar } from "./tar"
import { streamTarGz } from "./tar-stream"
import { readZip } from "./zip"

export type ArchiveFormat = "zip" | "tar.gz" | "tar"

/** By magic bytes, never by file name or content type, which the sender controls. */
export const archiveFormat = (bytes: Uint8Array): ArchiveFormat | undefined => {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "zip"
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return "tar.gz"
  if (bytes.length >= 262 && new TextDecoder().decode(bytes.subarray(257, 262)) === "ustar") return "tar"
  return undefined
}

const entriesOf = (bytes: Uint8Array, format: ArchiveFormat, limits: ArchiveLimits) => {
  switch (format) {
    case "zip":
      return readZip(bytes, limits)
    case "tar":
      return readTar(bytes)
    case "tar.gz":
      return streamTarGz(bytes, { ...streamingCaps(limits), keep: () => true })
  }
}

/** Tar headers and padding add to the expanded size, hence the slack over the file bytes the limits count. */
export const streamingCaps = (limits: ArchiveLimits) => ({
  maxExpandedBytes: limits.maxExpandedBytes + 1024 * 1024,
  overExpanded: () => rejected(`the archive expands beyond ${limits.maxExpandedBytes} bytes`),
  maxKeptBytes: limits.maxExpandedBytes,
  overKept: () => rejected(`the archive expands beyond ${limits.maxExpandedBytes} bytes`),
  // Directories and junk are entries too; `filesOf` holds the files themselves to `maxFiles`.
  maxEntries: limits.maxFiles * 4 + 64
})

/**
 * Turns entries into files (sizes from the headers, so entries a streaming read skipped count too), refusing anything a skill folder should not contain: symlinks and hard links
 * (they could point outside the folder once written to disk), devices, unsafe paths and duplicates.
 */
export const filesOf = (entries: ReadonlyArray<RawEntry>, limits: ArchiveLimits): Effect.Effect<ReadonlyArray<ArchiveFile>, InvalidInput> =>
  Effect.suspend(() => {
    const files = new Map<string, ArchiveFile>()
    let total = 0
    for (const entry of entries) {
      if (entry.kind === "dir") continue
      const normalised = normaliseEntryPath(entry.name)
      if ("refused" in normalised) return Effect.fail(rejected(`refused ${normalised.refused}`))
      if (isJunk(normalised.path)) continue
      if (entry.kind === "link") return Effect.fail(rejected(`"${normalised.path}" is a link; skills may only contain regular files`))
      if (entry.kind === "other") return Effect.fail(rejected(`"${normalised.path}" is not a regular file`))
      if (files.has(normalised.path)) return Effect.fail(rejected(`"${normalised.path}" appears twice`))
      if (entry.size > limits.maxFileBytes) return Effect.fail(rejected(`"${normalised.path}" is larger than ${limits.maxFileBytes} bytes`))
      total += entry.size
      if (total > limits.maxExpandedBytes) return Effect.fail(rejected(`the archive expands beyond ${limits.maxExpandedBytes} bytes`))
      files.set(normalised.path, { path: normalised.path, mode: modeOf(entry.mode), bytes: entry.data })
      if (files.size > limits.maxFiles) return Effect.fail(rejected(`more than ${limits.maxFiles} files`))
    }
    return Effect.succeed(Array.from(files.values()))
  })

/** Unpacks a .zip, .tar.gz or .tar within `limits`; every failure is an `InvalidInput` naming the problem. */
export const extractArchive = Effect.fn("skills.extractArchive")(function*(bytes: Uint8Array, limits: ArchiveLimits) {
  yield* Effect.annotateCurrentSpan({ "archive.bytes": bytes.length })
  if (bytes.length > limits.maxCompressedBytes) return yield* rejected(`the archive is larger than ${limits.maxCompressedBytes} bytes`)
  const format = archiveFormat(bytes)
  if (format === undefined) return yield* rejected("expected a .zip or .tar.gz archive")
  yield* Effect.annotateCurrentSpan({ "archive.format": format })
  return yield* Effect.flatMap(entriesOf(bytes, format, limits), (entries) => filesOf(entries, limits))
})

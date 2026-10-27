import { InvalidInput, type SkillFileMode } from "@pc/domain"

/** Caps for anything we unpack: a skill is a few documents and scripts, never a dataset. */
export interface ArchiveLimits {
  readonly maxCompressedBytes: number
  readonly maxExpandedBytes: number
  readonly maxFiles: number
  readonly maxFileBytes: number
}

export const DefaultArchiveLimits: ArchiveLimits = {
  maxCompressedBytes: 5 * 1024 * 1024,
  maxExpandedBytes: 20 * 1024 * 1024,
  maxFiles: 500,
  maxFileBytes: 5 * 1024 * 1024
}

/**
 * GitHub repositories are archived whole before we pick the skill folder out, so their caps are larger;
 * the selected folder is then held to `DefaultArchiveLimits`.
 */
export const RepositoryArchiveLimits: ArchiveLimits = {
  maxCompressedBytes: 25 * 1024 * 1024,
  maxExpandedBytes: 100 * 1024 * 1024,
  maxFiles: 20_000,
  maxFileBytes: 10 * 1024 * 1024
}

/** One regular file of an unpacked archive, its path already validated. */
export interface ArchiveFile {
  readonly path: string
  readonly mode: SkillFileMode
  readonly bytes: Uint8Array
}

export const rejected = (message: string) => new InvalidInput({ message, field: "archive" })

/** Only the owner-executable bit is kept; setuid, world-writable and the like never survive. */
export const modeOf = (unixMode: number): SkillFileMode => ((unixMode & 0o100) !== 0 ? "755" : "644")

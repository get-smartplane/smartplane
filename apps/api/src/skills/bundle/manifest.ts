import type { SkillFile } from "@pc/domain"
import { Effect } from "effect"
import type { ArchiveFile } from "../archive/limits"

const hex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")

export const sha256Bytes = (bytes: Uint8Array): Effect.Effect<string> =>
  Effect.promise(async () => hex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))))

/** Code-unit order, which is what every client sorts by too: the manifest must not depend on locale. */
const byPath = (a: { readonly path: string }, b: { readonly path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/** A file with its manifest entry. */
export interface HashedFile {
  readonly entry: SkillFile
  readonly bytes: Uint8Array
}

/** Hashes every file of a folder, sorted by path: the manifest is the entries in this order. */
export const hashFiles = (files: ReadonlyArray<ArchiveFile>): Effect.Effect<ReadonlyArray<HashedFile>> =>
  Effect.forEach([...files].sort(byPath), (file) =>
    Effect.map(sha256Bytes(file.bytes), (sha256) => ({ entry: { path: file.path, size: file.bytes.length, sha256, mode: file.mode }, bytes: file.bytes })))

/**
 * sha256 over one `path\tsize\tsha256\tmode\n` line per file, in manifest order. Paths cannot contain tabs
 * or newlines (`SkillFilePath`), so the encoding is unambiguous, and equal folders hash equal however they
 * were packed.
 */
export const contentHashOf = (manifest: ReadonlyArray<SkillFile>): Effect.Effect<string> =>
  sha256Bytes(new TextEncoder().encode([...manifest].sort(byPath).map((file) => `${file.path}\t${file.size}\t${file.sha256}\t${file.mode}\n`).join("")))

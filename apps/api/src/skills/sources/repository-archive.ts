import { Effect } from "effect"
import { normaliseEntryPath } from "../archive/entry-path"
import { filesOf, streamingCaps } from "../archive/extract"
import { type ArchiveLimits, DefaultArchiveLimits, rejected, RepositoryArchiveLimits } from "../archive/limits"
import { streamTarGz } from "../archive/tar-stream"
import { selectSkillRoot, type SkillRoot, wrapperOf } from "../bundle/root"

const pathOf = (name: string): string | undefined => {
  const normalised = normaliseEntryPath(name)
  return "path" in normalised ? normalised.path : undefined
}

/**
 * Picks one skill folder out of a repository .tar.gz without ever holding the expanded repository: a
 * first streaming pass reads only headers (paths, kinds, sizes: every refusal `extractArchive` applies,
 * under the repository limits) to choose the folder, a second keeps only that folder's bytes, capped by
 * the skill limits while streaming. Peak memory is the compressed archive plus at most one skill folder.
 */
export const extractRepositorySkill = Effect.fn("skills.extractRepositorySkill")(function*(
  tarball: Uint8Array,
  wanted: string | undefined,
  limits: { readonly repository: ArchiveLimits; readonly skill: ArchiveLimits } = { repository: RepositoryArchiveLimits, skill: DefaultArchiveLimits }
) {
  yield* Effect.annotateCurrentSpan({ "archive.bytes": tarball.length })
  if (tarball.length > limits.repository.maxCompressedBytes) return yield* rejected(`the archive is larger than ${limits.repository.maxCompressedBytes} bytes`)
  if (tarball[0] !== 0x1f || tarball[1] !== 0x8b) return yield* rejected("expected a .tar.gz archive")
  const caps = streamingCaps(limits.repository)

  const listing = yield* filesOf(yield* streamTarGz(tarball, { ...caps, keep: () => false }), limits.repository)
  const chosen = yield* selectSkillRoot(listing, wanted)
  const prefix = `${wrapperOf(listing)}${chosen.folder === "" ? "" : `${chosen.folder}/`}`
  const selected = new Set(chosen.files.map((file) => `${prefix}${file.path}`))
  yield* Effect.annotateCurrentSpan({ "archive.entries": listing.length, "skill.files": selected.size })

  const kept = yield* streamTarGz(tarball, {
    ...caps,
    maxKeptBytes: limits.skill.maxExpandedBytes,
    overKept: () => rejected(`the skill is larger than ${limits.skill.maxExpandedBytes} bytes`),
    keep: (entry) => entry.kind === "file" && selected.has(pathOf(entry.name) ?? "")
  })
  const bytes = new Map(kept.flatMap((entry) => {
    const path = pathOf(entry.name)
    return path !== undefined && selected.has(path) ? [[path, entry.data] as const] : []
  }))
  // Both passes read the same bytes, so every selected path is found again.
  const root: SkillRoot = {
    folder: chosen.folder,
    files: chosen.files.map((file) => ({ ...file, bytes: bytes.get(`${prefix}${file.path}`) ?? new Uint8Array(0) }))
  }
  return root
})

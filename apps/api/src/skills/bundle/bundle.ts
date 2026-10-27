import { InvalidInput, type SkillFile } from "@pc/domain"
import { Effect } from "effect"
import { type ArchiveLimits, DefaultArchiveLimits } from "../archive/limits"
import { parseSkillMarkdown, type SkillMarkdown } from "./frontmatter"
import { contentHashOf, type HashedFile, hashFiles } from "./manifest"
import { decodeText } from "./mime"
import { SkillMd, type SkillRoot } from "./root"

/** A validated skill folder, ready to store and scan. */
export interface SkillBundle {
  /** Where the folder was in its source ("" for the root); its last segment is the expected skill name. */
  readonly folder: string
  /** Sorted by path; their entries are the manifest. */
  readonly files: ReadonlyArray<HashedFile>
  readonly manifest: ReadonlyArray<SkillFile>
  readonly contentHash: string
  readonly skillMd: SkillMarkdown
}

const invalid = (message: string) => new InvalidInput({ message, field: "archive" })

/**
 * The selected folder must itself fit the upload limits (a repository archive was only bounded by the
 * looser repository limits) and hold a UTF-8 SKILL.md.
 */
export const makeBundle = Effect.fn("skills.makeBundle")(function*(root: SkillRoot, limits: ArchiveLimits = DefaultArchiveLimits) {
  const total = root.files.reduce((size, file) => size + file.bytes.length, 0)
  yield* Effect.annotateCurrentSpan({ "skill.files": root.files.length, "skill.bytes": total })
  if (root.files.length > limits.maxFiles) return yield* invalid(`the skill has more than ${limits.maxFiles} files`)
  if (total > limits.maxExpandedBytes) return yield* invalid(`the skill is larger than ${limits.maxExpandedBytes} bytes`)
  const oversized = root.files.find((file) => file.bytes.length > limits.maxFileBytes)
  if (oversized !== undefined) return yield* invalid(`"${oversized.path}" is larger than ${limits.maxFileBytes} bytes`)
  const skillMdFile = root.files.find((file) => file.path === SkillMd)
  if (skillMdFile === undefined) return yield* invalid(`the skill has no ${SkillMd}`)
  const text = decodeText(skillMdFile.bytes)
  if (text === undefined) return yield* invalid(`${SkillMd} is not UTF-8 text`)
  const files = yield* hashFiles(root.files)
  const manifest = files.map((file) => file.entry)
  const bundle: SkillBundle = {
    folder: root.folder,
    files,
    manifest,
    contentHash: yield* contentHashOf(manifest),
    skillMd: parseSkillMarkdown(text)
  }
  return bundle
})

/** A single SKILL.md (a link to the file itself) as a one-file bundle. */
export const singleFileRoot = (bytes: Uint8Array): SkillRoot => ({ folder: "", files: [{ path: SkillMd, mode: "644", bytes }] })

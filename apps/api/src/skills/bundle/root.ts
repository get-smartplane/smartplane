import { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import type { ArchiveFile } from "../archive/limits"

export const SkillMd = "SKILL.md"

const folderOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "")

/**
 * GitHub tarballs (and many zips) wrap everything in one top-level folder; skills are addressed below it.
 * The wrapper's prefix (`"top/"`), or "" when there is none.
 */
export const wrapperOf = (files: ReadonlyArray<Pick<ArchiveFile, "path">>): string => {
  if (files.some((file) => file.path === SkillMd)) return ""
  const tops = new Set(files.map((file) => file.path.split("/")[0]))
  const [top] = tops
  if (tops.size !== 1 || top === undefined || !files.every((file) => file.path.startsWith(`${top}/`))) return ""
  return `${top}/`
}

const unwrap = (files: ReadonlyArray<ArchiveFile>): ReadonlyArray<ArchiveFile> => {
  const wrapper = wrapperOf(files)
  return wrapper === "" ? files : files.map((file) => ({ ...file, path: file.path.slice(wrapper.length) }))
}

const within = (files: ReadonlyArray<ArchiveFile>, folder: string): ReadonlyArray<ArchiveFile> =>
  folder === "" ? files : files.flatMap((file) => (file.path.startsWith(`${folder}/`) ? [{ ...file, path: file.path.slice(folder.length + 1) }] : []))

export interface SkillRoot {
  /** The skill folder's path inside the archive or repository ("" for the root). */
  readonly folder: string
  /** Its files, with paths relative to it. */
  readonly files: ReadonlyArray<ArchiveFile>
}

const notFound = (message: string) => new InvalidInput({ message, field: "path" })

/**
 * Picks the skill folder: `wanted` when given (also tried as `skills/<wanted>`, like `npx skills add
 * --skill`), else the root when it holds SKILL.md, else the only folder that does. Several candidates
 * without `wanted` is ambiguous and names them all.
 */
export const selectSkillRoot = (all: ReadonlyArray<ArchiveFile>, wanted: string | undefined): Effect.Effect<SkillRoot, InvalidInput> => {
  const files = unwrap(all)
  const candidates = files.filter((file) => file.path === SkillMd || file.path.endsWith(`/${SkillMd}`)).map((file) => folderOf(file.path)).sort()
  const has = (folder: string) => candidates.includes(folder)
  const listed = candidates.length === 0 ? "none" : candidates.map((folder) => folder || "(root)").slice(0, 20).join(", ")
  if (wanted !== undefined) {
    const folder = [wanted, `skills/${wanted}`].find(has)
    return folder === undefined
      ? Effect.fail(notFound(`no ${SkillMd} in "${wanted}". Skills found: ${listed}.`))
      : Effect.succeed({ folder, files: within(files, folder) })
  }
  if (has("")) return Effect.succeed({ folder: "", files })
  const [only, ...others] = candidates
  if (only === undefined) return Effect.fail(notFound(`no ${SkillMd} found`))
  if (others.length > 0) return Effect.fail(notFound(`${candidates.length} skills found (${listed}); choose one with a path.`))
  return Effect.succeed({ folder: only, files: within(files, only) })
}

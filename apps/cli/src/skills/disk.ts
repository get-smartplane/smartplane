import { Effect, FileSystem, Option, Path, Schema } from "effect"
import { failure } from "../app/failure"
import { containedPath, isSymlink } from "./contain"
import { Manifest, type ManagedSkill, manifestFile, ManifestJson, SkillsLock } from "./manifest"
import type { DiskSkill } from "./plan"
import { contentHash, modeBits } from "./render"
import type { SkillFile } from "./source"

export type SkillTarget = "claude" | "agents"

/** `.claude/skills` for Claude Code, `.agents/skills` for the Agent Skills convention (`npx skills`, Codex, ...). */
export const targetDir = (path: Path.Path, base: string, target: SkillTarget) =>
  path.join(base, target === "claude" ? ".claude" : ".agents", "skills")

/** The git root above `cwd`, or `cwd` itself outside a repository. */
export const projectRoot = (cwd: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    let dir = cwd
    while (true) {
      if (yield* fs.exists(path.join(dir, ".git"))) return dir
      const parent = path.dirname(dir)
      if (parent === dir) return cwd
      dir = parent
    }
  })

/** Every regular file under `folder`, by `/`-separated relative path, with its sha256; links are noted, never read. */
const folderFiles = (folder: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const files = new Map<string, string>()
    let links = false
    for (const relative of yield* fs.readDirectory(folder, { recursive: true })) {
      const full = path.join(folder, relative)
      if (yield* isSymlink(full)) links = true
      else if ((yield* fs.stat(full)).type === "File") files.set(relative.split(path.sep).join("/"), contentHash(yield* fs.readFile(full)))
    }
    return { files, links }
  })

/** Every folder in a skills directory, with what sync needs to decide whether it may touch it. */
export const scanSkills = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const found = new Map<string, DiskSkill>()
    if (!(yield* fs.exists(root))) return found
    for (const name of yield* fs.readDirectory(root)) {
      const folder = path.join(root, name)
      if (yield* isSymlink(folder)) found.set(name, { files: new Map(), links: true })
      else if ((yield* fs.stat(folder)).type === "Directory") found.set(name, yield* folderFiles(folder))
    }
    return found
  })

/** A manifest that is a link, or whose slugs or paths are unsafe, is corrupt: sync stops before touching anything. */
export const readManifest = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = (yield* Path.Path).join(root, manifestFile)
    const corrupt = failure(`${file} is not a Smartplane manifest this CLI understands; refusing to sync ${root}.`, "Update the CLI, or move the file aside.")
    if (yield* isSymlink(file)) return yield* corrupt
    if (!(yield* fs.exists(file))) return Option.none<Manifest>()
    return Option.some(yield* Schema.decodeUnknownEffect(ManifestJson)(yield* fs.readFileString(file)).pipe(Effect.mapError(() => corrupt)))
  })

/** Folder names `npx skills` recorded in `<base>/skills-lock.json`; an unreadable lock file claims nothing. */
export const lockedSkills = (base: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = (yield* Path.Path).join(base, "skills-lock.json")
    if (!(yield* fs.exists(file))) return new Set<string>()
    const lock = yield* Schema.decodeUnknownEffect(SkillsLock)(yield* fs.readFileString(file)).pipe(Effect.option)
    return new Set(Option.match(lock, { onNone: () => [], onSome: (value) => Object.keys(value.skills) }))
  })

/** Creates or truncates `full` without following a link in its place (O_NOFOLLOW), then sets its mode. */
const writeNoFollow = (full: string, bytes: Uint8Array, mode: number) =>
  Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = yield* fs.open(full, { flag: "w", mode, noFollow: true })
    yield* file.writeAll(bytes)
    // chmod follows links; the open above already refused one at this path, so this changes the file just written.
    yield* fs.chmod(full, mode)
  }))

/** Writes one skill folder under `root`: new and changed files (with their mode), minus files the skill no longer has. */
export const writeSkill = (root: string, slug: string, files: ReadonlyArray<SkillFile>, previous: ManagedSkill | undefined) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const keep = new Set(files.map((file) => file.path))
    for (const old of Object.keys(previous?.files ?? {})) {
      if (!keep.has(old)) yield* fs.remove(yield* containedPath(root, `${slug}/${old}`), { force: true })
    }
    for (const file of files) {
      const parent = file.path.split("/").slice(0, -1)
      yield* fs.makeDirectory(yield* containedPath(root, [slug, ...parent].join("/")), { recursive: true })
      yield* writeNoFollow(yield* containedPath(root, `${slug}/${file.path}`), file.bytes, modeBits(file.mode))
    }
  })

/** Removes a skill folder Smartplane wrote. `rm -r` removes links it meets inside rather than following them. */
export const removeSkill = (root: string, slug: string) =>
  Effect.gen(function*() {
    yield* (yield* FileSystem.FileSystem).remove(yield* containedPath(root, slug), { recursive: true })
  })

export const writeManifest = (root: string, manifest: Manifest) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    if (Object.keys(manifest.skills).length > 0) {
      yield* fs.makeDirectory(root, { recursive: true })
      const text = `${JSON.stringify(yield* Schema.encodeEffect(Manifest)(manifest), null, 2)}\n`
      yield* writeNoFollow(yield* containedPath(root, manifestFile), new TextEncoder().encode(text), 0o644)
    } else if (yield* fs.exists((yield* Path.Path).join(root, manifestFile))) {
      yield* fs.remove(yield* containedPath(root, manifestFile))
    }
  })

import { DateTime, Effect, FileSystem, Option, Path, Schema } from "effect"
import { currentSession } from "../api/session"
import { projectScope } from "../config/project-scope"
import { unifiedDiff } from "../app/diff"
import { Host } from "../app/host"
import { note } from "../app/output"
import { skillsRoot } from "./contain"
import { lockedSkills, projectRoot, readManifest, removeSkill, scanSkills, type SkillTarget, targetDir, writeManifest, writeSkill } from "./disk"
import type { ManagedSkill } from "./manifest"
import { McpConnection, type McpResources } from "./mcp"
import { nextManaged, planSync } from "./plan"
import { contentHash, prepareFiles, skillVersion } from "./render"
import { listSkills, readSkill, type SkillFile, type SkillListing } from "./source"

export interface SyncOptions {
  readonly global: boolean
  readonly targets: ReadonlyArray<SkillTarget>
  readonly dryRun: boolean
  readonly force: boolean
  /** `--project`; defaults to `.smartplane/project.json`. Narrows the gateway to org-wide plus that project's skills. */
  readonly project: Option.Option<string>
}

export const SyncReport = Schema.Struct({
  dir: Schema.String,
  dryRun: Schema.Boolean,
  steps: Schema.Array(Schema.Struct({
    slug: Schema.String,
    action: Schema.Literals(["create", "update", "unchanged", "delete", "forget", "conflict", "kept"]),
    reason: Schema.optionalKey(Schema.String)
  }))
})
export type SyncReport = typeof SyncReport.Type

/** Reads each skill at most once per run, and only when a target actually needs its files. */
const fileCache = (mcp: McpResources) => {
  const cache = new Map<string, ReadonlyArray<SkillFile>>()
  return (listing: SkillListing) =>
    Effect.gen(function*() {
      const hit = cache.get(listing.slug)
      if (hit !== undefined) return hit
      const files = prepareFiles(listing, yield* readSkill(mcp, listing))
      cache.set(listing.slug, files)
      return files
    })
}

const managedEntry = (version: string, files: ReadonlyArray<SkillFile>, syncedAt: string): ManagedSkill => ({
  version,
  files: Object.fromEntries(files.map((file) => [file.path, { hash: contentHash(file.bytes), mode: file.mode }])),
  syncedAt
})

/** `--dry-run`: the SKILL.md diff for each update. */
const preview = (folder: string, files: ReadonlyArray<SkillFile>) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = (yield* Path.Path).join(folder, "SKILL.md")
    const next = files.find((f) => f.path === "SKILL.md")
    if (next === undefined || !(yield* fs.exists(file))) return
    yield* note(unifiedDiff(file, yield* fs.readFileString(file), new TextDecoder().decode(next.bytes)))
  })

/** Mirrors the skill folders the caller may read into local skill directories, per the rules in `planSync`. */
export const syncSkills = (options: SyncOptions) =>
  Effect.scoped(Effect.gen(function*() {
    const session = yield* currentSession
    const path = yield* Path.Path
    const projectId = yield* projectScope(options.project)
    const mcp = yield* (yield* McpConnection).open(`${session.apiUrl}/mcp`, session.token, Option.match(projectId, { onNone: () => ({}), onSome: (id) => ({ projectId: id }) }))
    const { rejected, skills } = yield* listSkills(mcp)
    for (const slug of rejected) yield* note(`Skipping skill "${slug}": unsafe name or file path.`)
    const filesOf = fileCache(mcp)
    // Without a server version the content is the version, so those skills are read up front.
    const desired = yield* Effect.forEach(skills, (listing) =>
      Option.match(listing.version, {
        onSome: (version) => Effect.succeed({ slug: listing.slug, version: skillVersion(version, []) }),
        onNone: () => Effect.map(filesOf(listing), (files) => ({ slug: listing.slug, version: skillVersion(undefined, files) }))
      }))
    const versions = new Map(desired.map((skill) => [skill.slug, skill.version]))
    const listings = new Map(skills.map((listing) => [listing.slug, listing]))
    const base = options.global ? (yield* Host).home : yield* projectRoot((yield* Host).cwd)
    const lockedByOthers = yield* lockedSkills(base)
    const syncedAt = DateTime.formatIso(yield* DateTime.now)
    // Every target's root and manifest are checked before anything is written, so one bad target stops the run untouched.
    const prepared = yield* Effect.forEach(options.targets, (target) =>
      Effect.gen(function*() {
        const dir = targetDir(path, base, target)
        const root = yield* skillsRoot(base, dir, options.global)
        const manifest = yield* readManifest(root)
        const managed: Readonly<Record<string, ManagedSkill>> = Option.match(manifest, { onNone: () => ({}), onSome: (m) => m.skills })
        return { dir, root, managed }
      }))
    return yield* Effect.forEach(prepared, ({ dir, managed, root }) =>
      Effect.gen(function*() {
        const plan = planSync({ desired, managed, disk: yield* scanSkills(root), lockedByOthers, force: options.force })
        const written = new Map<string, ManagedSkill>()
        for (const step of plan) {
          const listing = listings.get(step.slug)
          const version = versions.get(step.slug)
          if ((step.action === "create" || step.action === "update") && listing !== undefined && version !== undefined) {
            const files = yield* filesOf(listing)
            if (options.dryRun) yield* preview(path.join(root, step.slug), files)
            else yield* writeSkill(root, step.slug, files, managed[step.slug])
            written.set(step.slug, managedEntry(version, files, syncedAt))
          }
          if (step.action === "delete" && !options.dryRun) yield* removeSkill(root, step.slug)
        }
        if (!options.dryRun) {
          yield* writeManifest(root, { version: 2, managedBy: "smartplane", apiUrl: session.apiUrl, skills: nextManaged(plan, written, managed) })
        }
        return { dir, dryRun: options.dryRun, steps: plan.map(({ action, reason, slug }) => ({ slug, action, ...(reason === undefined ? {} : { reason }) })) }
      }))
  }))

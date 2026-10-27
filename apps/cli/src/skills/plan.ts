import type { ManagedSkill } from "./manifest"

/** A skill folder as found on disk: sha256 of every regular file, by `/`-separated relative path. */
export interface DiskSkill {
  readonly files: ReadonlyMap<string, string>
  /** The folder, or something in it, is a symbolic link: sync never writes or deletes through it, even with --force. */
  readonly links?: boolean
}

export interface DesiredSkill {
  readonly slug: string
  readonly version: string
}

export type SkillAction = "create" | "update" | "unchanged" | "delete" | "forget" | "conflict" | "kept"

export interface PlannedSkill {
  readonly slug: string
  readonly action: SkillAction
  readonly reason?: string
}

export interface PlanInput {
  readonly desired: ReadonlyArray<DesiredSkill>
  readonly managed: Readonly<Record<string, ManagedSkill>>
  readonly disk: ReadonlyMap<string, DiskSkill>
  /** Folders another tool owns (skills-lock.json). */
  readonly lockedByOthers: ReadonlySet<string>
  /** Overwrite or delete managed folders even when edited locally. */
  readonly force: boolean
}

/** The folder holds exactly the files Smartplane wrote, unchanged. */
export const isPristine = (owned: ManagedSkill, found: DiskSkill): boolean => {
  const written = Object.entries(owned.files)
  return found.files.size === written.length && written.every(([path, file]) => found.files.get(path) === file.hash)
}

const edited = "edited locally; delete the folder or pass --force to overwrite"
const linked = "is or contains a symbolic link; Smartplane never writes or deletes through links"

/**
 * Decides what sync does with each folder. Smartplane only writes or removes folders its manifest says it wrote
 * and that are unchanged since; user-written skills and other tools' skills are never touched.
 */
export const planSync = ({ desired, disk, force, lockedByOthers, managed }: PlanInput): ReadonlyArray<PlannedSkill> => {
  const wanted = new Map(desired.map((skill) => [skill.slug, skill]))
  const slugs = [...new Set([...wanted.keys(), ...Object.keys(managed)])].sort()
  return slugs.map((slug): PlannedSkill => {
    const want = wanted.get(slug)
    const owned = managed[slug]
    const found = disk.get(slug)
    const pristine = owned !== undefined && found !== undefined && isPristine(owned, found)
    if (want !== undefined) {
      if (owned === undefined) {
        if (lockedByOthers.has(slug)) return { slug, action: "conflict", reason: "listed in skills-lock.json (installed by another tool)" }
        if (found !== undefined) return { slug, action: "conflict", reason: "a folder Smartplane did not write already has this name" }
        return { slug, action: "create" }
      }
      if (found === undefined) return { slug, action: "create" }
      if (found.links === true) return { slug, action: "conflict", reason: linked }
      if (!pristine && !force) return { slug, action: "conflict", reason: edited }
      return pristine && want.version === owned.version ? { slug, action: "unchanged" } : { slug, action: "update" }
    }
    // Managed but no longer readable: the grant was revoked or the skill removed.
    if (found === undefined) return { slug, action: "forget" }
    if (found.links === true) return { slug, action: "kept", reason: `no longer granted, but ${linked}` }
    if (!pristine && !force) return { slug, action: "kept", reason: "no longer granted, but edited locally, so left in place" }
    return { slug, action: "delete" }
  })
}

/** The manifest after applying `plan`: written skills get their new entry; unchanged and conflicted keep theirs. */
export const nextManaged = (
  plan: ReadonlyArray<PlannedSkill>,
  written: ReadonlyMap<string, ManagedSkill>,
  managed: Readonly<Record<string, ManagedSkill>>
): Record<string, ManagedSkill> =>
  Object.fromEntries(plan.flatMap((step): ReadonlyArray<readonly [string, ManagedSkill]> => {
    const entry = step.action === "create" || step.action === "update"
      ? written.get(step.slug)
      : step.action === "unchanged" || step.action === "conflict"
      ? managed[step.slug]
      : undefined
    return entry === undefined ? [] : [[step.slug, entry]]
  }))

import { DateTime, Effect } from "effect"
import { Forbidden, type OrgId, type Resource, ResourceId, UserId } from "@pc/domain"
import { parseSkillMarkdown } from "../bundle/frontmatter"
import { contentHashOf, sha256Bytes } from "../bundle/manifest"
import { SkillMd } from "../bundle/root"
import smartplaneDeployMd from "./smartplane/references/deploy.md"
import smartplaneSkillMd from "./smartplane/SKILL.md"

/**
 * Skills shipped with Smartplane itself and served to every org next to its own skills, with no grant. They
 * live in the repository as static files, so they cannot be edited or deleted through the API, and their
 * version is the content hash of the file as deployed.
 */
export interface BuiltinSkill {
  readonly slug: string
  /** The synthetic resource id audit data and `skills_list` refer to; never a row in the database. */
  readonly id: ResourceId
  readonly description: string
  /** SKILL.md. */
  readonly text: string
  /** Every file, SKILL.md first; the others are served as `skill://<slug>/<path>`. */
  readonly files: ReadonlyArray<BuiltinFile>
}

export interface BuiltinFile {
  readonly path: string
  readonly text: string
}

/** `references` maps a path inside the skill folder to its text, imported like SKILL.md. */
const builtin = (slug: string, id: string, text: string, references: Readonly<Record<string, string>> = {}): BuiltinSkill => ({
  slug,
  id: ResourceId.make(id),
  description: parseSkillMarkdown(text).description ?? "",
  text,
  files: [{ path: SkillMd, text }, ...Object.entries(references).map(([path, body]) => ({ path, text: body }))]
})

export const builtinSkills: ReadonlyArray<BuiltinSkill> = [
  builtin("smartplane", "res_builtinsmartplane", smartplaneSkillMd, { "references/deploy.md": smartplaneDeployMd })
]

const builtinIds = new Set<string>(builtinSkills.map((skill) => skill.id))

/** Built-in skills are not rows: any write to one of their ids is refused rather than reported as missing. */
export const isBuiltinSkillId = (id: string): boolean => builtinIds.has(id)

/** For the resource write paths: a built-in skill ships with Smartplane, so nobody edits or deletes it. */
export const refuseBuiltin = (id: string): Effect.Effect<void, Forbidden> =>
  isBuiltinSkillId(id) ? Effect.fail(new Forbidden({ message: "built-in skills are read-only" })) : Effect.void

export const isBuiltinSlug = (slug: string): boolean => builtinSkills.some((skill) => skill.slug === slug)

const shippedBy = UserId.make("usr_smartplane")
const shippedAt = DateTime.makeUnsafe("2026-10-01T00:00:00.000Z")

/** The resource shape the serving code expects, scoped to the caller's org; org-wide, read-only, built in. */
export const builtinResource = (orgId: OrgId, skill: BuiltinSkill): Resource => ({
  id: skill.id,
  orgId,
  projectId: null,
  name: skill.slug,
  description: skill.description,
  config: { kind: "skill", source: "inline", description: skill.description, body: skill.text },
  createdBy: shippedBy,
  createdAt: shippedAt,
  updatedAt: null
})

/** The manifest entries of a built-in's files, SKILL.md first; their content hash is the version clients see. */
export const builtinEntries = (skill: BuiltinSkill) =>
  Effect.forEach(skill.files, (file) =>
    Effect.gen(function*() {
      const bytes = new TextEncoder().encode(file.text)
      return { path: file.path, size: bytes.length, sha256: yield* sha256Bytes(bytes), mode: "644" as const }
    }))

export const builtinVersion = (skill: BuiltinSkill): Effect.Effect<string> => Effect.flatMap(builtinEntries(skill), contentHashOf)

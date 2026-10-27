import type { Resource, SkillConfig } from "@pc/domain"
import { allows, type EffectiveAccess } from "../../access/resolution"
import { slugify } from "../../platform/ids"

/** A skill the caller holds `read` on, under the name MCP clients show for it. */
export interface GrantedSkill {
  /** The prompt name, and the `skill://` resource path; Claude Code shows it as `/mcp__<server>__<slug>`. */
  readonly slug: string
  readonly resource: Resource
  readonly config: SkillConfig
}

export const SkillUriScheme = "skill://"

/** `skill://<slug>` is the skill's SKILL.md; `skill://<slug>/<path>` any other file of it. */
export const skillUri = (slug: string, path = "SKILL.md"): string => (path === "SKILL.md" ? `${SkillUriScheme}${slug}` : `${SkillUriScheme}${slug}/${path}`)

/** Slugs never contain `/`, so the first one separates the slug from the file path. */
export const parseSkillUri = (uri: string): { readonly slug: string; readonly path: string } | undefined => {
  if (!uri.startsWith(SkillUriScheme)) return undefined
  const rest = uri.slice(SkillUriScheme.length)
  const slash = rest.indexOf("/")
  return slash === -1 ? { slug: rest, path: "SKILL.md" } : { slug: rest.slice(0, slash), path: rest.slice(slash + 1) }
}

/**
 * Every skill the caller may read, ordered by slug then id. Access already accounts for project scope,
 * expiry and revocation, so this only narrows by kind and action.
 */
export const readableSkills = (access: EffectiveAccess): ReadonlyArray<GrantedSkill> =>
  Array.from(access.values())
    .flatMap((grant) => {
      const { resource } = grant
      return resource.config.kind === "skill" && allows(grant, "read") ? [{ slug: slugify(resource.name), resource, config: resource.config }] : []
    })
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.resource.id.localeCompare(b.resource.id))

/**
 * One skill per slug of `readableSkills`' sorted output, so prompt names and URIs are unambiguous. On a clash the lowest id wins, deterministically;
 * the other stays reachable by its full name through `skills_get`, and renaming either resolves it.
 */
export const uniqueBySlug = (sorted: ReadonlyArray<GrantedSkill>): ReadonlyArray<GrantedSkill> =>
  sorted.filter((skill, index) => sorted[index - 1]?.slug !== skill.slug)

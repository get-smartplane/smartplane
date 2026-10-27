import type { SkillArgument } from "@pc/domain"
import { toBase64 } from "../../platform/encoding"
import { decodeText, isTextMime } from "../../skills/bundle/mime"
import { isBuiltin, type ServedFile, type ServedSkill } from "../../skills/serving/content"
import type { McpPrompt, McpResource, McpResourceContents, SkillFileMeta } from "../sdk-skills"
import { skillUri } from "./granted"

/**
 * The `_meta` contract shared with the CLI (`smartplane skills sync`): which skill a file belongs to, its
 * path inside the skill folder, its mode and the version (content hash) it was served from.
 */
export const fileMeta = (skill: ServedSkill, file: ServedFile): SkillFileMeta => ({
  "smartplane.dev/skill": skill.slug,
  "smartplane.dev/path": file.path,
  "smartplane.dev/mode": file.mode,
  "smartplane.dev/version": skill.contentHash,
  // Shipped with Smartplane: read-only, served to everyone, not a resource anyone can edit or revoke.
  ...(isBuiltin(skill) ? { "smartplane.dev/builtin": "true" } : {})
})

export const toPrompt = (skill: ServedSkill, args: ReadonlyArray<SkillArgument>): McpPrompt => ({
  name: skill.slug,
  title: skill.resource.name,
  description: skill.description,
  arguments: args
})

/** One resource per file: SKILL.md as `skill://<slug>`, the rest as `skill://<slug>/<path>`. */
export const toResources = (skill: ServedSkill): ReadonlyArray<McpResource> =>
  skill.files.map((file, index) => ({
    uri: skillUri(skill.slug, file.path),
    name: index === 0 ? skill.slug : `${skill.slug}/${file.path}`,
    title: index === 0 ? skill.resource.name : `${skill.resource.name}: ${file.path}`,
    description: index === 0 ? skill.description : `File of the ${skill.slug} skill.`,
    mimeType: file.mimeType,
    size: file.size,
    _meta: fileMeta(skill, file)
  }))

/** Text types that decode as UTF-8 are `text`; anything else is a base64 `blob`. */
export const toContents = (uri: string, skill: ServedSkill, file: ServedFile, bytes: Uint8Array): McpResourceContents => {
  const text = isTextMime(file.mimeType) ? decodeText(bytes) : undefined
  const _meta = fileMeta(skill, file)
  return text === undefined ? { uri, mimeType: file.mimeType, blob: toBase64(bytes), _meta } : { uri, mimeType: file.mimeType, text, _meta }
}

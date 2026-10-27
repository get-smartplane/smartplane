import { defaultSkillScanPolicy, type InlineSkillConfig, isInlineSkill, type OrgId, type SkillFileMode, type SkillTemplate, type SkillVersion } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import type { GrantedSkill } from "../../mcp/skills/granted"
import { AppConfig, skillScanningEnabled } from "../../platform/config"
import { parseSkillMarkdown } from "../bundle/frontmatter"
import { contentHashOf, sha256Bytes } from "../bundle/manifest"
import { mimeTypeOf } from "../bundle/mime"
import { SkillMd } from "../bundle/root"
import { builtinEntries, builtinResource, builtinSkills, type BuiltinFile, type BuiltinSkill } from "../builtin/builtin-skills"
import { isServable } from "../scan/verdict"
import { SkillBlobs } from "../storage/blobs"
import { readFile } from "../storage/open-version"
import { SkillPolicyRepo } from "../storage/policy-repo"
import { SkillVersionsRepo } from "../storage/versions-repo"

export interface ServedFile {
  readonly path: string
  readonly mode: SkillFileMode
  readonly size: number
  readonly sha256: string
  readonly mimeType: string
}

/** A granted skill as agents get it: its files (SKILL.md first) and the version they belong to. */
export interface ServedSkill extends GrantedSkill {
  readonly description: string
  /** The served version's content hash; for inline skills, the hash of the one-file bundle. */
  readonly contentHash: string
  readonly files: ReadonlyArray<ServedFile>
  readonly source:
    | { readonly _tag: "inline"; readonly config: InlineSkillConfig }
    | { readonly _tag: "bundle"; readonly version: SkillVersion }
    | { readonly _tag: "builtin"; readonly files: ReadonlyArray<BuiltinFile> }
}

/** True for skills shipped with Smartplane: no grant, no row, audited without a resource target. */
export const isBuiltin = (skill: ServedSkill): boolean => skill.source._tag === "builtin"

const encoder = new TextEncoder()

const inlineSkill = (skill: GrantedSkill, config: InlineSkillConfig): Effect.Effect<ServedSkill> =>
  Effect.gen(function*() {
    const bytes = encoder.encode(config.body)
    const entry = { path: SkillMd, size: bytes.length, sha256: yield* sha256Bytes(bytes), mode: "644" as const }
    return {
      ...skill,
      description: config.description,
      contentHash: yield* contentHashOf([entry]),
      files: [{ ...entry, mimeType: "text/markdown" }],
      source: { _tag: "inline", config }
    }
  })

const builtinServed = (orgId: OrgId, builtin: BuiltinSkill): Effect.Effect<ServedSkill> =>
  Effect.gen(function*() {
    const resource = builtinResource(orgId, builtin)
    const entries = yield* builtinEntries(builtin)
    return {
      slug: builtin.slug,
      resource,
      config: { kind: "skill", source: "inline", description: builtin.description, body: builtin.text },
      description: builtin.description,
      contentHash: yield* contentHashOf(entries),
      files: entries.map((entry) => ({ ...entry, mimeType: mimeTypeOf(entry.path) })),
      source: { _tag: "builtin", files: builtin.files }
    }
  })

const bundleSkill = (skill: GrantedSkill, version: SkillVersion): ServedSkill => ({
  ...skill,
  description: version.description === "" ? skill.config.description : version.description,
  contentHash: version.contentHash,
  files: [...version.files]
    .sort((a, b) => (a.path === SkillMd ? -1 : b.path === SkillMd ? 1 : 0))
    .map((file) => ({ ...file, mimeType: mimeTypeOf(file.path) })),
  source: { _tag: "bundle", version }
})

/**
 * What agents are served for granted skills. Inline skills are one-file bundles; a bundle skill is served
 * at its active version, and only while that version is servable under the scan policy and flag (see
 * `isServable`). A skill with nothing servable is left out, exactly as if it were not granted.
 */
export class SkillContent extends Context.Service<SkillContent, {
  readonly serve: (orgId: OrgId, skills: ReadonlyArray<GrantedSkill>) => Effect.Effect<ReadonlyArray<ServedSkill>>
  /** The built-in skills followed by the granted ones; callers that need unique slugs let the built-in win. */
  readonly serveWithBuiltins: (orgId: OrgId, skills: ReadonlyArray<GrantedSkill>) => Effect.Effect<ReadonlyArray<ServedSkill>>
  readonly read: (skill: ServedSkill, file: ServedFile) => Effect.Effect<Uint8Array>
  /** The prompt template: SKILL.md's body and arguments (frontmatter arguments for bundles). */
  readonly template: (skill: ServedSkill) => Effect.Effect<SkillTemplate>
}>()("api/skills/SkillContent") {
  static readonly layer = Layer.effect(
    SkillContent,
    Effect.gen(function*() {
      const versions = yield* SkillVersionsRepo
      const policies = yield* SkillPolicyRepo
      const blobs = yield* SkillBlobs
      const scanning = skillScanningEnabled(yield* AppConfig)

      const serve = Effect.fn("SkillContent.serve")(function*(orgId: OrgId, skills: ReadonlyArray<GrantedSkill>) {
        const bundles = skills.filter((skill) => !isInlineSkill(skill.config))
        const active = new Map((yield* versions.active(orgId, bundles.map((skill) => skill.resource.id))).map((version) => [version.resourceId, version]))
        // The policy only matters with scanning on; with it off, `isServable` still refuses blocked versions.
        const policy = scanning && bundles.length > 0 ? yield* policies.get(orgId) : defaultSkillScanPolicy
        const servable = (version: SkillVersion) => isServable(version, policy, scanning)
        const served = yield* Effect.forEach(skills, (skill) => {
          if (isInlineSkill(skill.config)) return Effect.map(inlineSkill(skill, skill.config), Option.some)
          const version = active.get(skill.resource.id)
          return Effect.succeed(version !== undefined && servable(version) ? Option.some(bundleSkill(skill, version)) : Option.none())
        })
        yield* Effect.annotateCurrentSpan({ "skills.granted": skills.length, "skills.served": served.filter(Option.isSome).length })
        return served.flatMap(Option.toArray)
      })

      const read = Effect.fn("SkillContent.read")(function*(skill: ServedSkill, file: ServedFile) {
        yield* Effect.annotateCurrentSpan({ "skill.path": file.path })
        if (skill.source._tag === "inline") return encoder.encode(skill.source.config.body)
        if (skill.source._tag === "builtin") return encoder.encode(skill.source.files.find((candidate) => candidate.path === file.path)?.text ?? "")
        return yield* Effect.provideService(readFile(skill.source.version, file), SkillBlobs, blobs)
      })

      const template = Effect.fn("SkillContent.template")(function*(skill: ServedSkill) {
        if (skill.source._tag === "inline") return skill.source.config
        const [skillMd] = skill.files
        if (skillMd === undefined) return { body: "" }
        const markdown = parseSkillMarkdown(new TextDecoder().decode(yield* read(skill, skillMd)))
        const parsed: SkillTemplate = { body: markdown.body, ...(markdown.arguments === undefined ? {} : { arguments: markdown.arguments }) }
        return parsed
      })

      const serveWithBuiltins = Effect.fn("SkillContent.serveWithBuiltins")(function*(orgId: OrgId, skills: ReadonlyArray<GrantedSkill>) {
        const builtins = yield* Effect.forEach(builtinSkills, (builtin) => builtinServed(orgId, builtin))
        return [...builtins, ...(yield* serve(orgId, skills))]
      })

      return SkillContent.of({ serve, serveWithBuiltins, read, template })
    })
  )
}

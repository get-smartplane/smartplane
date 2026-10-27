import { Schema } from "effect"
import { ResourceId } from "../ids"
import { Description } from "../primitives"

/** What a skill body's `{{name}}` placeholder and the MCP prompt argument are called. */
export const SkillArgumentName = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/)).annotate({
  identifier: "SkillArgumentName"
})

/** One value a skill asks for; MCP clients prompt for it when the skill is used as a slash command. */
export const SkillArgument = Schema.Struct({
  name: SkillArgumentName,
  description: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(500))),
  required: Schema.optionalKey(Schema.Boolean)
}).annotate({ identifier: "SkillArgument" })
export type SkillArgument = typeof SkillArgument.Type

const distinctNames = Schema.makeFilter(
  (args: ReadonlyArray<SkillArgument>) => new Set(args.map((arg) => arg.name)).size === args.length,
  { expected: "arguments with distinct names" }
)

export const SkillArguments = Schema.Array(SkillArgument).check(Schema.isMaxLength(20), distinctNames)

/** `owner/repo`, as GitHub allows them. */
export const GithubRepo = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/)).annotate({
  identifier: "GithubRepo"
})

/** A folder inside a repository or archive: relative, `/`-separated, no dot segments. */
export const SkillFolder = Schema.String.check(
  Schema.isMaxLength(512),
  Schema.isPattern(/^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._@+ -]+(?:\/[A-Za-z0-9._@+ -]+)*$/)
).annotate({ identifier: "SkillFolder" })

/** A branch, tag or commit SHA. */
export const GitRef = Schema.String.check(
  Schema.isMaxLength(200),
  Schema.isPattern(/^(?!.*\.\.)(?!\/)[A-Za-z0-9._\/-]+$/)
).annotate({ identifier: "GitRef" })

/** Skill links are fetched by the server, so only HTTPS is accepted (SSRF checks run at fetch time too). */
export const HttpsUrl = Schema.String.check(Schema.isMaxLength(2048), Schema.isPattern(/^https:\/\/[^\s]+$/)).annotate({ identifier: "HttpsUrl" })

/**
 * Today's markdown editor: the body is the whole skill. `source` is optional so skills stored before
 * bundles existed decode unchanged, and `arguments` likewise.
 */
export const InlineSkillConfig = Schema.Struct({
  kind: Schema.tag("skill"),
  source: Schema.optionalKey(Schema.Literal("inline")),
  description: Description,
  body: Schema.String.check(Schema.isMaxLength(100_000)),
  arguments: Schema.optionalKey(SkillArguments)
}).annotate({ identifier: "InlineSkillConfig" })
export type InlineSkillConfig = typeof InlineSkillConfig.Type

/**
 * A skill folder in a GitHub repository, pinned per version to the commit its `ref` resolved to.
 * Private repositories read with the token in `tokenSecretId` (a `secret` resource), never inline.
 */
export const GithubSkillConfig = Schema.Struct({
  kind: Schema.tag("skill"),
  source: Schema.Literal("github"),
  description: Description,
  repo: GithubRepo,
  path: Schema.optionalKey(SkillFolder),
  ref: Schema.optionalKey(GitRef),
  tokenSecretId: Schema.optionalKey(ResourceId)
}).annotate({ identifier: "GithubSkillConfig" })
export type GithubSkillConfig = typeof GithubSkillConfig.Type

/** A URL to a single `SKILL.md` or to a .zip / .tar.gz of a skill folder. */
export const LinkSkillConfig = Schema.Struct({
  kind: Schema.tag("skill"),
  source: Schema.Literal("link"),
  description: Description,
  url: HttpsUrl
}).annotate({ identifier: "LinkSkillConfig" })
export type LinkSkillConfig = typeof LinkSkillConfig.Type

/** A skill folder uploaded as an archive; each new version is another upload. */
export const UploadSkillConfig = Schema.Struct({
  kind: Schema.tag("skill"),
  source: Schema.Literal("upload"),
  description: Description
}).annotate({ identifier: "UploadSkillConfig" })
export type UploadSkillConfig = typeof UploadSkillConfig.Type

/** For bundles, `description` mirrors the active version's frontmatter; the files live in versions. */
export const SkillConfig = Schema.Union([InlineSkillConfig, GithubSkillConfig, LinkSkillConfig, UploadSkillConfig]).annotate({
  identifier: "SkillConfig"
})
export type SkillConfig = typeof SkillConfig.Type

export type BundleSkillConfig = GithubSkillConfig | LinkSkillConfig | UploadSkillConfig

export const isInlineSkill = (config: SkillConfig): config is InlineSkillConfig => config.source === undefined || config.source === "inline"

/** Where a skill's content comes from; skills stored before sources existed are inline. */
export const skillSourceOf = (config: SkillConfig): "inline" | BundleSkillConfig["source"] => config.source ?? "inline"

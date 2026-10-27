import { Schema } from "effect"
import { ProjectId, ResourceId } from "../ids"
import { Description, Name } from "../primitives"
import { Resource } from "../resources/resource"
import { GithubRepo, GitRef, HttpsUrl, SkillFolder } from "./config"
import { SkillVersion } from "./version"

/** Use `parseGithubSpec` to turn `owner/repo/path@ref` into these fields. */
export const GithubSourceInput = Schema.Struct({
  type: Schema.Literal("github"),
  repo: GithubRepo,
  path: Schema.optionalKey(SkillFolder),
  ref: Schema.optionalKey(GitRef),
  /** A `secret` resource holding a GitHub token, for private repositories. */
  tokenSecretId: Schema.optionalKey(ResourceId)
}).annotate({ identifier: "GithubSourceInput" })

export const LinkSourceInput = Schema.Struct({
  type: Schema.Literal("link"),
  url: HttpsUrl
}).annotate({ identifier: "LinkSourceInput" })

export const SkillSourceInput = Schema.Union([GithubSourceInput, LinkSourceInput]).annotate({ identifier: "SkillSourceInput" })
export type SkillSourceInput = typeof SkillSourceInput.Type

/** `description` defaults to the SKILL.md frontmatter's. */
export const CreateSkill = Schema.Struct({
  name: Name,
  description: Schema.optionalKey(Description),
  projectId: Schema.NullOr(ProjectId),
  source: SkillSourceInput
}).annotate({ identifier: "CreateSkill" })
export type CreateSkill = typeof CreateSkill.Type

/** Query of an archive upload; the body is the .zip or .tar.gz itself (raw, or the `file` field of a multipart form). */
export const UploadSkillQuery = Schema.Struct({
  name: Name,
  description: Schema.optionalKey(Description),
  projectId: Schema.optionalKey(ProjectId),
  filename: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(255)))
}).annotate({ identifier: "UploadSkillQuery" })
export type UploadSkillQuery = typeof UploadSkillQuery.Type

export const UploadVersionQuery = Schema.Struct({
  filename: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(255)))
}).annotate({ identifier: "UploadVersionQuery" })
export type UploadVersionQuery = typeof UploadVersionQuery.Type

export const SkillCreated = Schema.Struct({
  resource: Resource,
  version: SkillVersion
}).annotate({ identifier: "SkillCreated" })
export type SkillCreated = typeof SkillCreated.Type

export const OverrideScan = Schema.Struct({
  reason: Schema.Trimmed.check(Schema.isBetweenLength(1, 2000))
}).annotate({ identifier: "OverrideScan" })
export type OverrideScan = typeof OverrideScan.Type

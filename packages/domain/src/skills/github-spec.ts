import { Result, Schema } from "effect"
import { InvalidInput } from "../errors"
import { GithubRepo, GitRef, SkillFolder } from "./config"

/** Where a GitHub skill lives: the repository, optionally a folder in it and a branch, tag or commit. */
export const GithubSpec = Schema.Struct({
  repo: GithubRepo,
  path: Schema.optionalKey(SkillFolder),
  ref: Schema.optionalKey(GitRef)
}).annotate({ identifier: "GithubSpec" })
export type GithubSpec = typeof GithubSpec.Type

const decodeSpec = Schema.decodeUnknownResult(GithubSpec)

const treeUrl = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/(?:tree|blob)\/([^/]+)(?:\/(.+?))?\/?$/
const repoUrl = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/
const shorthand = /^(?:github:)?([^/@\s]+\/[^/@\s]+)(?:\/([^@\s]+?))?\/?(?:@([^@\s]+))?$/

const invalid = (input: string) =>
  new InvalidInput({
    message: `"${input}" is not a GitHub skill. Use owner/repo, owner/repo/path/to/skill, owner/repo@ref or a github.com/owner/repo/tree/<ref>/<path> URL.`,
    field: "spec"
  })

const parts = (input: string): { repo: string; path?: string; ref?: string } | undefined => {
  const tree = treeUrl.exec(input)
  // A `blob` URL points at a file; a skill is the folder holding SKILL.md.
  if (tree?.[1] !== undefined && tree[2] !== undefined) return { repo: tree[1], ref: tree[2], path: tree[3]?.replace(/\/?SKILL\.md$/, "") || undefined }
  const plain = repoUrl.exec(input)
  if (plain?.[1] !== undefined) return { repo: plain[1] }
  const short = shorthand.exec(input)
  if (short?.[1] !== undefined) return { repo: short[1], path: short[2], ref: short[3] }
  return undefined
}

/**
 * Parses the forms people paste, like `npx skills add`: `owner/repo`, `owner/repo/skills/pdf`,
 * `owner/repo@v1.2.0`, `owner/repo/skills/pdf@main`, `github:owner/repo` and github.com tree/blob URLs.
 * A `--skill name` style lookup is the `path` (`pdf` also matches `skills/pdf` when the bundle is resolved).
 */
export const parseGithubSpec = (input: string): Result.Result<GithubSpec, InvalidInput> => {
  const found = parts(input.trim())
  if (found === undefined) return Result.fail(invalid(input))
  const candidate = {
    repo: found.repo,
    ...(found.path === undefined || found.path === "" ? {} : { path: found.path }),
    ...(found.ref === undefined ? {} : { ref: found.ref })
  }
  return Result.mapError(decodeSpec(candidate), () => invalid(input))
}

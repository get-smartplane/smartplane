import { createHash } from "node:crypto"
import type { FileMode, SkillArgument, SkillFile, SkillListing } from "./source"

/** Claude Code reads at most this much of a skill description. */
const maxDescription = 1024

/**
 * A JSON string is a valid YAML double-quoted scalar: quotes, backslashes, newlines and control characters are
 * all escaped, so no description can break out of the frontmatter.
 */
export const yamlString = (value: string): string => JSON.stringify(value)

const hasFrontmatter = (text: string) => /^---\r?\n/.test(text)

const argumentLine = (arg: SkillArgument) =>
  `- \`${arg.name}\`${arg.required ? " (required)" : ""}${arg.description ? `: ${arg.description}` : ""}`

const argumentsSection = (args: ReadonlyArray<SkillArgument>) =>
  args.length === 0 ? [] : [
    "## Arguments",
    "",
    "This skill is a template. Ask the user for any value you do not already know, then use it wherever the",
    "instructions below say `{{name}}`:",
    "",
    ...args.map(argumentLine),
    ""
  ]

/**
 * `SKILL.md` in the Claude Code / Agent Skills format. A file that already has frontmatter (a skill imported
 * from a repository) is kept byte for byte; a bare template gets frontmatter marking it as Smartplane's.
 */
export const skillMarkdown = (listing: Pick<SkillListing, "slug" | "description" | "arguments">, body: string): string =>
  hasFrontmatter(body) ? body : [
    "---",
    `name: ${listing.slug}`,
    `description: ${yamlString(listing.description.slice(0, maxDescription))}`,
    "metadata:",
    "  managed-by: smartplane",
    `  source: ${yamlString(`skill://${listing.slug}`)}`,
    "---",
    "",
    ...argumentsSection(listing.arguments),
    body.replace(/\s+$/, ""),
    ""
  ].join("\n")

export const contentHash = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex")

/** Bumped when the rendering above changes, so already-synced skills are rewritten once. */
const renderVersion = "r1"

/** The server's version when it sends one, else a hash of every file's path, mode and content. */
export const skillVersion = (serverVersion: string | undefined, files: ReadonlyArray<SkillFile>): string =>
  `${renderVersion}:${serverVersion ?? contentHash(
    [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => `${f.path}\0${f.mode}\0${contentHash(f.bytes)}`).join("\n")
  )}`

/** The files as they are written: SKILL.md rendered, everything else untouched. */
export const prepareFiles = (listing: SkillListing, files: ReadonlyArray<SkillFile>): ReadonlyArray<SkillFile> =>
  files.map((file) =>
    file.path === "SKILL.md"
      ? { ...file, bytes: new TextEncoder().encode(skillMarkdown(listing, new TextDecoder().decode(file.bytes))) }
      : file
  )

export const modeBits = (mode: FileMode): number => (mode === "755" ? 0o755 : 0o644)

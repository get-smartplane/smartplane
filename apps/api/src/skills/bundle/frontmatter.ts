import { SkillArguments } from "@pc/domain"
import { Option, Schema } from "effect"
import { parse } from "yaml"

/**
 * Only the Agent Skills fields we use are read. Unknown keys (license, allowed-tools, metadata, ...) are
 * ignored; a field of the wrong shape reads as absent and is left to the scanner to flag.
 */
const decodeField = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, value: unknown) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(schema)(value))

export interface SkillMarkdown {
  /** Whether the file opened with a `---` block that parsed as a YAML mapping. */
  readonly hasFrontmatter: boolean
  readonly name: string | undefined
  readonly description: string | undefined
  readonly arguments: typeof SkillArguments.Type | undefined
  /** The markdown after the frontmatter: what a prompt renders. */
  readonly body: string
}

const Block = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

const parseYaml = (source: string): unknown => {
  try {
    // Aliases are capped so a "billion laughs" document cannot blow up.
    return parse(source, { maxAliasCount: 16, prettyErrors: false })
  } catch {
    return undefined
  }
}

/** Splits SKILL.md into frontmatter fields and body. Never fails: malformed frontmatter reads as none. */
export const parseSkillMarkdown = (text: string): SkillMarkdown => {
  const match = Block.exec(text)
  const yaml = match?.[1] === undefined ? undefined : parseYaml(match[1])
  if (match === null || typeof yaml !== "object" || yaml === null || Array.isArray(yaml)) {
    return { hasFrontmatter: false, name: undefined, description: undefined, arguments: undefined, body: text }
  }
  const fields: Record<string, unknown> = { ...yaml }
  return {
    hasFrontmatter: true,
    name: decodeField(Schema.String, fields.name),
    description: decodeField(Schema.String, fields.description),
    arguments: decodeField(SkillArguments, fields.arguments),
    body: text.slice(match[0].length)
  }
}

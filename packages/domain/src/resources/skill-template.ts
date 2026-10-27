import { Result } from "effect"
import { InvalidInput } from "../errors"
import type { InlineSkillConfig } from "../skills/config"

/** `{{name}}`, optionally padded with spaces, optionally escaped as `\{{name}}`. */
const Placeholder = /(\\?)\{\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}\}/g

export const MaxSkillArgumentLength = 10_000

/** What rendering needs: an inline skill, or a bundle's SKILL.md body with its frontmatter arguments. */
export type SkillTemplate = Pick<InlineSkillConfig, "body" | "arguments">

/** Argument values by name, as MCP `prompts/get` sends them. */
export type SkillArgumentValues = Readonly<Record<string, string>>

const checkValues = (config: SkillTemplate, values: SkillArgumentValues): InvalidInput | undefined => {
  const declared = config.arguments ?? []
  const names = new Set(declared.map((arg) => arg.name))
  const unknown = Object.keys(values).filter((name) => !names.has(name))
  if (unknown.length > 0) {
    const accepted = declared.length === 0 ? "none" : declared.map((arg) => arg.name).join(", ")
    return new InvalidInput({ message: `Unknown argument "${unknown[0]}". This skill accepts: ${accepted}.`, field: unknown[0] })
  }
  const missing = declared.find((arg) => arg.required === true && (values[arg.name] ?? "").trim() === "")
  if (missing !== undefined) return new InvalidInput({ message: `Missing required argument "${missing.name}".`, field: missing.name })
  const tooLong = Object.keys(values).find((name) => (values[name] ?? "").length > MaxSkillArgumentLength)
  if (tooLong !== undefined) return new InvalidInput({ message: `Argument "${tooLong}" is longer than ${MaxSkillArgumentLength} characters.`, field: tooLong })
  return undefined
}

/**
 * Fills a skill body's placeholders for its declared arguments, in one pass:
 * - `{{name}}` becomes the value (an omitted optional argument becomes ""),
 * - `\{{name}}` stays as the literal text `{{name}}`,
 * - placeholders that name no declared argument are left untouched, so bodies written before arguments
 *   existed (or that document other template languages) render byte for byte as stored.
 * Values are inserted verbatim and never re-scanned, so a value containing `{{other}}` cannot expand.
 */
export const renderSkill = (config: SkillTemplate, values: SkillArgumentValues): Result.Result<string, InvalidInput> => {
  const invalid = checkValues(config, values)
  if (invalid !== undefined) return Result.fail(invalid)
  const declared = new Set((config.arguments ?? []).map((arg) => arg.name))
  return Result.succeed(config.body.replace(Placeholder, (match: string, escape: string, name: string) => {
    if (!declared.has(name)) return match
    return escape === "" ? (values[name] ?? "") : match.slice(1)
  }))
}

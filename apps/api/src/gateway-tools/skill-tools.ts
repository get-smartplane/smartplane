import { InvalidInput, renderSkill, type SkillArgumentValues } from "@pc/domain"
import { Effect, Schema } from "effect"
import { textResult, type McpTool, type ToolResult } from "../mcp/sdk"
import { readableSkills, skillUri } from "../mcp/skills/granted"
import type { CallerScope } from "../mcp/provider"
import { isBuiltin, type SkillContent, type ServedSkill } from "../skills/serving/content"

/** For clients without MCP prompt support; the same skills are also served as prompts and `skill://` resources. */
export const skillToolDefinitions = {
  skills_list: { name: "skills_list", description: "List skills (reusable instructions) available to you.", inputSchema: { type: "object", properties: {} } },
  skills_get: {
    name: "skills_get",
    description:
      "Get a skill's SKILL.md by name, plus the list of its other files (read them as skill:// resources). Pass `arguments` to fill the skill's {{placeholders}}.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, arguments: { type: "object", additionalProperties: { type: "string" } } },
      required: ["name"]
    }
  }
} satisfies Record<string, McpTool>

const SkillArgs = Schema.Struct({ name: Schema.NonEmptyString, arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)) })
export const decodeSkillArgs = (args: unknown) =>
  Schema.decodeUnknownEffect(SkillArgs)(args).pipe(
    Effect.mapError(() => new InvalidInput({ message: "expected { \"name\": string, \"arguments\"?: { [name]: string } }" }))
  )

/** Built-ins first, so a built-in wins a lookup by slug; org skills stay reachable by their full name. */
const served = (content: SkillContent["Service"], scope: CallerScope) => content.serveWithBuiltins(scope.principal.orgId, readableSkills(scope.access))

export const listSkills = (content: SkillContent["Service"], scope: CallerScope): Effect.Effect<ToolResult> =>
  Effect.gen(function*() {
    const skills = yield* served(content, scope)
    const listed = yield* Effect.forEach(skills, (skill) =>
      Effect.map(content.template(skill), (template) => ({
        name: skill.resource.name,
        slug: skill.slug,
        description: skill.description,
        ...(template.arguments === undefined ? {} : { arguments: template.arguments }),
        ...(skill.files.length > 1 ? { files: skill.files.length } : {}),
        ...(isBuiltin(skill) ? { builtin: true } : {})
      })))
    return textResult(JSON.stringify(listed))
  })

const fileList = (skill: ServedSkill): string =>
  skill.files.length <= 1
    ? ""
    : `\n\n---\nFiles of this skill (read them as MCP resources):\n${skill.files.slice(1).map((file) => `- ${skillUri(skill.slug, file.path)} (${file.size} bytes)`).join("\n")}`

/**
 * Without `arguments`, SKILL.md comes back as stored (inline skills: exactly the body, as before bundles
 * existed); with them, the body is rendered. Bundles append their file list either way.
 */
export const getSkill = (content: SkillContent["Service"], scope: CallerScope, name: string, values: SkillArgumentValues | undefined) =>
  Effect.gen(function*() {
    const skill = (yield* served(content, scope)).find((candidate) => candidate.resource.name === name || candidate.slug === name)
    const [skillMd] = skill?.files ?? []
    if (skill === undefined || skillMd === undefined) return textResult("Not found or not permitted.", true)
    if (values === undefined) return textResult(new TextDecoder().decode(yield* content.read(skill, skillMd)) + fileList(skill))
    const rendered = yield* Effect.fromResult(renderSkill(yield* content.template(skill), values))
    return textResult(rendered + fileList(skill))
  })

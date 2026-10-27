import { describe, expect, it } from "@effect/vitest"
import { Result, Schema } from "effect"
import { InlineSkillConfig } from "../skills/config"
import { renderSkill } from "./skill-template"

const decode = Schema.decodeUnknownSync(InlineSkillConfig)

const skill = decode({
  kind: "skill",
  description: "Release notes",
  body: "Notes for {{ version }} in {{tone}}. Literal: \\{{version}}. Other: {{unknown}} {{#each}}.",
  arguments: [{ name: "version", required: true, description: "Tag to describe" }, { name: "tone" }]
})

const render = (values: Readonly<Record<string, string>>) => renderSkill(skill, values)

describe("skill configs", () => {
  it("decodes skills stored before arguments existed, unchanged", () => {
    expect(decode({ kind: "skill", description: "d", body: "b" })).toEqual({ kind: "skill", description: "d", body: "b" })
  })

  it("rejects argument names that are not placeholders, and duplicates", () => {
    expect(() => decode({ kind: "skill", description: "d", body: "b", arguments: [{ name: "has space" }] })).toThrow()
    expect(() => decode({ kind: "skill", description: "d", body: "b", arguments: [{ name: "a" }, { name: "a" }] })).toThrow()
  })
})

describe("renderSkill", () => {
  it("fills declared placeholders once, keeps escapes literal and leaves undeclared ones untouched", () => {
    expect(render({ version: "v2", tone: "plain words" })).toEqual(
      Result.succeed("Notes for v2 in plain words. Literal: {{version}}. Other: {{unknown}} {{#each}}.")
    )
  })

  it("inserts values verbatim, without re-expanding or replacement patterns", () => {
    expect(Result.getOrThrow(render({ version: "{{tone}} $& $1", tone: "x" }))).toContain("Notes for {{tone}} $& $1 in x.")
  })

  it("renders an omitted optional argument as empty", () => {
    expect(Result.getOrThrow(render({ version: "v2" }))).toContain("Notes for v2 in .")
  })

  it("refuses a missing or blank required argument and unknown arguments", () => {
    const blank: ReadonlyArray<Readonly<Record<string, string>>> = [{}, { version: "  " }]
    for (const values of blank) {
      const result = render(values)
      expect(Result.isFailure(result) && result.failure.message).toBe(`Missing required argument "version".`)
    }
    const unknown = render({ version: "v2", colour: "red" })
    expect(Result.isFailure(unknown) && unknown.failure.message).toBe(`Unknown argument "colour". This skill accepts: version, tone.`)
  })

  it("renders a skill without arguments byte for byte", () => {
    const plain = decode({ kind: "skill", description: "d", body: "Use {{x}} and \\{{y}} as is." })
    expect(renderSkill(plain, {})).toEqual(Result.succeed("Use {{x}} and \\{{y}} as is."))
  })
})

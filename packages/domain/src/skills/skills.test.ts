import { describe, expect, it } from "@effect/vitest"
import { Result, Schema } from "effect"
import { ResourceConfig } from "../resources/config"
import { isInlineSkill, SkillConfig } from "./config"
import { parseGithubSpec } from "./github-spec"
import { maxSeverity, severityAtLeast } from "./scan"
import { SkillFile } from "./version"

const decodeConfig = Schema.decodeUnknownSync(SkillConfig)

describe("skill configs", () => {
  it("decodes skills stored before sources existed as inline skills, unchanged", () => {
    const stored = { kind: "skill", description: "Summarise", body: "# Steps" }
    const config = Schema.decodeUnknownSync(ResourceConfig)(stored)
    expect(config).toEqual(stored)
    expect(config.kind === "skill" && isInlineSkill(config)).toBe(true)
  })

  it("tags bundle skills by source", () => {
    const github = decodeConfig({ kind: "skill", source: "github", description: "", repo: "anthropics/skills", path: "skills/pdf", ref: "main" })
    expect([github.source, isInlineSkill(github)]).toEqual(["github", false])
    expect(decodeConfig({ kind: "skill", source: "link", description: "", url: "https://example.com/SKILL.md" }).source).toBe("link")
    expect(decodeConfig({ kind: "skill", source: "upload", description: "" }).source).toBe("upload")
  })

  it("rejects plain-http links, bad repos and folders that escape the repository", () => {
    expect(() => decodeConfig({ kind: "skill", source: "link", description: "", url: "http://example.com/SKILL.md" })).toThrow()
    expect(() => decodeConfig({ kind: "skill", source: "github", description: "", repo: "not a repo" })).toThrow()
    for (const path of ["../x", "a/../../b", "/etc", "a/./b"]) {
      expect(() => decodeConfig({ kind: "skill", source: "github", description: "", repo: "a/b", path }), path).toThrow()
    }
  })
})

describe("GitHub skill specs", () => {
  const parse = (input: string) => Result.getOrThrow(parseGithubSpec(input))

  it("accepts the forms `npx skills add` accepts", () => {
    expect(parse("anthropics/skills")).toEqual({ repo: "anthropics/skills" })
    expect(parse("github:anthropics/skills")).toEqual({ repo: "anthropics/skills" })
    expect(parse("anthropics/skills/skills/pdf")).toEqual({ repo: "anthropics/skills", path: "skills/pdf" })
    expect(parse("anthropics/skills@v1.0")).toEqual({ repo: "anthropics/skills", ref: "v1.0" })
    expect(parse("anthropics/skills/skills/pdf@main")).toEqual({ repo: "anthropics/skills", path: "skills/pdf", ref: "main" })
    expect(parse("https://github.com/anthropics/skills")).toEqual({ repo: "anthropics/skills" })
    expect(parse("https://github.com/anthropics/skills.git")).toEqual({ repo: "anthropics/skills" })
    expect(parse("https://github.com/anthropics/skills/tree/main/skills/pdf")).toEqual({ repo: "anthropics/skills", ref: "main", path: "skills/pdf" })
    expect(parse("https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md")).toEqual({ repo: "anthropics/skills", ref: "main", path: "skills/pdf" })
  })

  it("refuses anything else as invalid input", () => {
    for (const input of ["", "justone", "a/b/../../etc", "https://gitlab.com/a/b", "a b/c", "a/b@x..y"]) {
      const result = parseGithubSpec(input)
      expect(Result.isFailure(result), input).toBe(true)
    }
  })
})

describe("scan severities", () => {
  it("orders severities", () => {
    expect(severityAtLeast("critical", "high")).toBe(true)
    expect(severityAtLeast("medium", "high")).toBe(false)
    expect(maxSeverity(["low", "high", "medium"])).toBe("high")
    expect(maxSeverity([])).toBeUndefined()
  })
})

describe("skill file manifests", () => {
  it("only accepts paths relative to the skill root", () => {
    const decode = Schema.decodeUnknownSync(SkillFile)
    const file = { size: 1, sha256: "a".repeat(64), mode: "644" }
    expect(decode({ ...file, path: "scripts/run.sh" }).path).toBe("scripts/run.sh")
    for (const path of ["/abs", "../up", "a/../b", "a\\b", "a//b", "a/./b", ""]) {
      expect(() => decode({ ...file, path }), path).toThrow()
    }
  })
})

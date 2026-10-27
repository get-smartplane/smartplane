import { describe, expect, it } from "vitest"
import { isSafePath, isSafeSlug } from "./paths"
import { skillMarkdown, skillVersion } from "./render"

const frontmatter = (text: string) => text.split("---\n")[1] ?? ""
const skill = (description: string, args: ReadonlyArray<{ name: string; description?: string; required?: boolean }> = []) =>
  ({ slug: "release-notes", description, arguments: args })

describe("skillMarkdown", () => {
  it("adds Claude Code frontmatter to a bare template", () => {
    expect(skillMarkdown(skill("Use when drafting notes."), "Body {{version}}\n\n")).toBe([
      "---",
      "name: release-notes",
      "description: \"Use when drafting notes.\"",
      "metadata:",
      "  managed-by: smartplane",
      "  source: \"skill://release-notes\"",
      "---",
      "",
      "Body {{version}}",
      ""
    ].join("\n"))
  })

  it("keeps a SKILL.md that already has frontmatter byte for byte", () => {
    const text = "---\nname: imported\ndescription: from a repo\n---\n\n# Imported\n"
    expect(skillMarkdown(skill("other"), text)).toBe(text)
  })

  it("keeps hostile descriptions inside one YAML scalar", () => {
    const description = "x\"\n---\nname: evil\n\\ #: [a] {b} \u0007"
    const meta = frontmatter(skillMarkdown(skill(description), ""))
    expect(meta.split("\n").filter((line) => line.startsWith("name:"))).toEqual(["name: release-notes"])
    const line = meta.split("\n").find((l) => l.startsWith("description: ")) ?? ""
    expect(JSON.parse(line.slice("description: ".length))).toBe(description)
  })

  it("documents declared arguments so the agent asks for them", () => {
    const text = skillMarkdown(skill("d", [{ name: "version", description: "Git tag", required: true }, { name: "tone" }]), "For {{version}}")
    expect(text).toContain("## Arguments")
    expect(text).toContain("- `version` (required): Git tag")
    expect(text).toContain("- `tone`")
  })
})

describe("skillVersion", () => {
  const file = (path: string, text: string, mode: "644" | "755" = "644") => ({ path, mode, bytes: new TextEncoder().encode(text) })

  it("uses the server version when there is one", () => {
    expect(skillVersion("abc", [])).toBe("r1:abc")
  })

  it("otherwise hashes paths, modes and contents, independent of order", () => {
    const a = skillVersion(undefined, [file("SKILL.md", "x"), file("run.sh", "y", "755")])
    expect(skillVersion(undefined, [file("run.sh", "y", "755"), file("SKILL.md", "x")])).toBe(a)
    expect(skillVersion(undefined, [file("SKILL.md", "x"), file("run.sh", "y")])).not.toBe(a)
  })
})

describe("paths", () => {
  it("accepts only folder-safe slugs and relative paths", () => {
    expect(isSafeSlug("release-notes")).toBe(true)
    for (const bad of ["../x", "a/b", ".hidden", "", "A"]) expect(isSafeSlug(bad)).toBe(false)
    expect(isSafePath("scripts/run.sh")).toBe(true)
    for (const bad of ["/etc/passwd", "../x", "a/../b", "a\\b", "C:/x", "a//b", "./a", ""]) expect(isSafePath(bad)).toBe(false)
  })
})

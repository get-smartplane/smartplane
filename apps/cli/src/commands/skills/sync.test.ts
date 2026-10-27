import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fakeMcp, type FakeSkill } from "../../testing/fake-mcp"
import { runCli, tempDir } from "../../testing/run-cli"

const env = { SMARTPLANE_TOKEN: "pc_test" }
const binary = new Uint8Array([0, 255, 1, 2, 128])

const releaseNotes = (version: string, files?: FakeSkill["files"]): FakeSkill => ({
  slug: "release-notes",
  description: "Use when drafting release notes.",
  version,
  files: files ?? [
    { path: "SKILL.md", text: "Write notes for {{version}}." },
    { path: "scripts/collect.sh", text: "#!/bin/sh\ngit log\n", mode: "755" },
    { path: "assets/logo.png", bytes: binary }
  ],
  arguments: [{ name: "version", required: true }]
})

const setup = (initial: ReadonlyArray<FakeSkill>, legacy = false) => {
  const root = tempDir()
  mkdirSync(join(root, ".git"))
  let skills = initial
  const fake = fakeMcp(() => skills, { legacy })
  const sync = (...args: Array<string>) => runCli(["skills", "sync", ...args], { env, cwd: root, home: tempDir(), mcp: fake.mcp })
  return { root, sync, reads: fake.reads, serve: (next: ReadonlyArray<FakeSkill>) => void (skills = next) }
}

const skillDir = (root: string, target = ".claude") => join(root, target, "skills", "release-notes")

describe("skills sync", () => {
  it("writes whole folders: nested files, binary content and executable bits, in both targets", async () => {
    const { root, sync } = setup([releaseNotes("v1")])
    const run = await sync()
    expect(run.exitCode).toBe(0)
    for (const target of [".claude", ".agents"]) {
      const dir = skillDir(root, target)
      expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toContain("name: release-notes")
      expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toContain("## Arguments")
      expect(new Uint8Array(readFileSync(join(dir, "assets/logo.png")))).toEqual(binary)
      expect(statSync(join(dir, "scripts/collect.sh")).mode & 0o777).toBe(0o755)
      expect(statSync(join(dir, "SKILL.md")).mode & 0o777).toBe(0o644)
      expect(existsSync(join(root, target, "skills", ".smartplane.json"))).toBe(true)
    }
  })

  it("skips reading unchanged skills, and removes files a new version dropped", async () => {
    const { reads, root, serve, sync } = setup([releaseNotes("v1")])
    await sync("--target", "claude")
    const readsAfterFirst = [...reads.values()].reduce((a, b) => a + b, 0)
    const again = await sync("--target", "claude", "--json")
    expect(JSON.parse(again.stdout)[0].steps).toEqual([{ slug: "release-notes", action: "unchanged" }])
    expect([...reads.values()].reduce((a, b) => a + b, 0)).toBe(readsAfterFirst)
    serve([releaseNotes("v2", [{ path: "SKILL.md", text: "Shorter." }])])
    await sync("--target", "claude")
    expect(existsSync(join(skillDir(root), "scripts/collect.sh"))).toBe(false)
    expect(existsSync(join(skillDir(root), "assets/logo.png"))).toBe(false)
    expect(readFileSync(join(skillDir(root), "SKILL.md"), "utf8")).toContain("Shorter.")
  })

  it("deletes a skill when its grant is revoked, but never user-written or other tools' skills", async () => {
    const { root, serve, sync } = setup([releaseNotes("v1")])
    const mine = join(root, ".claude", "skills", "mine")
    mkdirSync(mine, { recursive: true })
    writeFileSync(join(mine, "SKILL.md"), "my own")
    await sync()
    serve([])
    const run = await sync("--json")
    expect(JSON.parse(run.stdout)[0].steps).toEqual([{ slug: "release-notes", action: "delete" }])
    expect(existsSync(skillDir(root))).toBe(false)
    expect(readFileSync(join(mine, "SKILL.md"), "utf8")).toBe("my own")
    expect(existsSync(join(root, ".claude", "skills", ".smartplane.json"))).toBe(false)
  })

  it("reports a conflict instead of overwriting a folder it does not own", async () => {
    const { root, sync } = setup([releaseNotes("v1")])
    mkdirSync(skillDir(root), { recursive: true })
    writeFileSync(join(skillDir(root), "SKILL.md"), "hand-written")
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify({ version: 1, skills: { "release-notes": {} } }))
    const run = await sync("--target", "claude", "--json")
    expect(JSON.parse(run.stdout)[0].steps[0].action).toBe("conflict")
    expect(readFileSync(join(skillDir(root), "SKILL.md"), "utf8")).toBe("hand-written")
  })

  it("keeps a locally edited managed skill unless --force", async () => {
    const { root, serve, sync } = setup([releaseNotes("v1")])
    await sync("--target", "claude")
    writeFileSync(join(skillDir(root), "SKILL.md"), "my edit")
    serve([releaseNotes("v2")])
    const quiet = await sync("--target", "claude", "--quiet")
    expect(quiet.stdout).toBe("")
    expect(quiet.stderr).toContain("edited locally")
    expect(readFileSync(join(skillDir(root), "SKILL.md"), "utf8")).toBe("my edit")
    await sync("--target", "claude", "--force")
    expect(readFileSync(join(skillDir(root), "SKILL.md"), "utf8")).toContain("Write notes")
  })

  it("--dry-run reports and diffs without writing", async () => {
    const { root, serve, sync } = setup([releaseNotes("v1")])
    const first = await sync("--target", "claude", "--dry-run")
    expect(first.stdout).toContain("[dry run]")
    expect(first.stdout).toContain("+ created")
    expect(existsSync(skillDir(root))).toBe(false)
    await sync("--target", "claude")
    serve([releaseNotes("v2", [{ path: "SKILL.md", text: "Changed." }])])
    const second = await sync("--target", "claude", "--dry-run")
    expect(second.stdout).toContain("~ updated")
    expect(second.stderr).toContain("+Changed.")
    expect(readFileSync(join(skillDir(root), "SKILL.md"), "utf8")).toContain("Write notes")
  })

  it("works with servers that only serve skill://<slug> without _meta", async () => {
    const { root, sync } = setup([releaseNotes("ignored")], true)
    expect((await sync("--target", "agents")).exitCode).toBe(0)
    expect(readFileSync(join(skillDir(root, ".agents"), "SKILL.md"), "utf8")).toContain("Write notes")
    const again = await sync("--target", "agents", "--json")
    expect(JSON.parse(again.stdout)[0].steps[0].action).toBe("unchanged")
  })

  it("drops a skill whose file paths try to escape its folder", async () => {
    const evil: FakeSkill = { slug: "evil", description: "x", version: "v", files: [{ path: "SKILL.md", text: "x" }, { path: "../../escape.sh", text: "rm -rf /" }] }
    const { root, sync } = setup([evil, releaseNotes("v1")])
    const run = await sync("--target", "claude")
    expect(run.stderr).toContain("Skipping skill \"evil\"")
    expect(existsSync(join(root, ".claude", "skills", "evil"))).toBe(false)
    expect(existsSync(join(root, "escape.sh"))).toBe(false)
    expect(existsSync(skillDir(root))).toBe(true)
  })
})

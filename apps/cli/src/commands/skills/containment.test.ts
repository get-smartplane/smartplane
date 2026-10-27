import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fakeMcp, type FakeSkill } from "../../testing/fake-mcp"
import { runCli, tempDir } from "../../testing/run-cli"

const env = { SMARTPLANE_TOKEN: "pc_test" }

const notes = (version: string): FakeSkill => ({
  slug: "release-notes",
  description: "Use when drafting release notes.",
  version,
  files: [{ path: "SKILL.md", text: `Notes ${version}.` }, { path: "scripts/collect.sh", text: "#!/bin/sh\n", mode: "755" }]
})

/** A project, a home and a directory outside both that sync must never write to or delete from. */
const setup = () => {
  const root = tempDir()
  const home = tempDir()
  const outside = tempDir()
  mkdirSync(join(root, ".git"))
  writeFileSync(join(outside, "precious"), "keep me")
  let skills: ReadonlyArray<FakeSkill> = [notes("v1")]
  const fake = fakeMcp(() => skills)
  const sync = (...args: Array<string>) => runCli(["skills", "sync", "--target", "claude", ...args], { env, cwd: root, home, mcp: fake.mcp })
  const skillsDir = join(root, ".claude", "skills")
  const manifestPath = join(skillsDir, ".smartplane.json")
  return { root, home, outside, sync, skillsDir, manifestPath, folder: join(skillsDir, "release-notes"), serve: (next: ReadonlyArray<FakeSkill>) => void (skills = next) }
}

interface ManifestJson {
  skills: Record<string, { version: string; syncedAt: string; files: Record<string, { hash: string; mode: string }> }>
}

const untouched = (outside: string) => readFileSync(join(outside, "precious"), "utf8") === "keep me"

describe("skills sync containment", () => {
  it.each([
    ["a `..` file key", (manifest: ManifestJson, outside: string) => {
      manifest.skills["release-notes"]!.files[`../../../../../..${join(outside, "precious")}`] = { hash: "x", mode: "644" }
    }],
    ["a `..` slug", (manifest: ManifestJson, outside: string) => {
      manifest.skills[`../../../../../..${outside}`] = { version: "v", syncedAt: "now", files: { precious: { hash: "x", mode: "644" } } }
    }],
    ["an absolute file key", (manifest: ManifestJson, outside: string) => {
      manifest.skills["release-notes"]!.files[join(outside, "precious")] = { hash: "x", mode: "644" }
    }]
  ])("treats a manifest with %s as corrupt and touches nothing", async (_, tamper) => {
    const { folder, manifestPath, outside, serve, sync } = setup()
    expect((await sync()).exitCode).toBe(0)
    const manifest: ManifestJson = JSON.parse(readFileSync(manifestPath, "utf8"))
    tamper(manifest, outside)
    writeFileSync(manifestPath, JSON.stringify(manifest))
    serve([notes("v2")])
    const run = await sync("--force")
    expect(run.exitCode).toBe(1)
    expect(run.stderr).toContain("is not a Smartplane manifest")
    expect(untouched(outside)).toBe(true)
    expect(readFileSync(join(folder, "SKILL.md"), "utf8")).toContain("Notes v1.")
  })

  it("never writes into or deletes a skill folder swapped for a symlink, even with --force", async () => {
    const { folder, outside, serve, sync } = setup()
    await sync()
    writeFileSync(join(outside, "SKILL.md"), "theirs")
    rmSync(folder, { recursive: true })
    symlinkSync(outside, folder)
    serve([notes("v2")])
    const update = await sync("--force", "--json")
    expect(update.exitCode).toBe(0)
    expect(JSON.parse(update.stdout)[0].steps[0]).toMatchObject({ action: "conflict", reason: expect.stringContaining("symbolic link") })
    serve([])
    const revoke = await sync("--force", "--json")
    expect(JSON.parse(revoke.stdout)[0].steps[0]).toMatchObject({ action: "kept" })
    expect(readFileSync(join(outside, "SKILL.md"), "utf8")).toBe("theirs")
    expect(untouched(outside)).toBe(true)
    expect(existsSync(join(outside, "scripts"))).toBe(false)
  })

  it("never writes through a file swapped for a symlink, even with --force", async () => {
    const { folder, outside, serve, sync } = setup()
    await sync()
    unlinkSync(join(folder, "scripts", "collect.sh"))
    symlinkSync(join(outside, "precious"), join(folder, "scripts", "collect.sh"))
    serve([notes("v2")])
    const run = await sync("--force", "--json")
    expect(JSON.parse(run.stdout)[0].steps[0]).toMatchObject({ action: "conflict", reason: expect.stringContaining("symbolic link") })
    expect(untouched(outside)).toBe(true)
  })

  it("refuses a project skills directory that is a symlink, before writing anything", async () => {
    const { outside, root, skillsDir, sync } = setup()
    mkdirSync(join(root, ".claude"))
    symlinkSync(outside, skillsDir)
    const run = await sync()
    expect(run.exitCode).toBe(1)
    expect(run.stderr).toContain("symbolic link inside the project")
    expect(readdirSync(outside)).toEqual(["precious"])
  })

  it("refuses a project .claude directory that is a symlink", async () => {
    const { outside, root, sync } = setup()
    symlinkSync(outside, join(root, ".claude"))
    expect((await sync()).exitCode).toBe(1)
    expect(readdirSync(outside)).toEqual(["precious"])
  })

  it("follows a symlinked skills directory under --global, where the user chose the link", async () => {
    const { home, outside, sync } = setup()
    mkdirSync(join(home, ".claude"))
    symlinkSync(outside, join(home, ".claude", "skills"))
    expect((await sync("--global")).exitCode).toBe(0)
    expect(readFileSync(join(outside, "release-notes", "SKILL.md"), "utf8")).toContain("Notes v1.")
    expect(existsSync(join(outside, ".smartplane.json"))).toBe(true)
    expect(untouched(outside)).toBe(true)
  })
})

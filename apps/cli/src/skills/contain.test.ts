import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { tempDir } from "../testing/run-cli"
import { removeSkill, writeSkill } from "./disk"
import type { SkillFile } from "./source"

/** The disk layer on its own, as if a link were planted between the scan and the write. */
const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) => Effect.runPromiseExit(effect.pipe(Effect.provide(NodeServices.layer)))

const skillFiles: ReadonlyArray<SkillFile> = [{ path: "SKILL.md", mode: "644", bytes: new TextEncoder().encode("# pdf") }]

const setup = () => {
  const root = tempDir()
  const outside = tempDir()
  writeFileSync(join(outside, "precious"), "keep me")
  return { root, outside }
}

describe("writeSkill containment", () => {
  it("refuses a previous file key that walks out of the folder (the H1 repro)", async () => {
    const { outside, root } = setup()
    const previous = { version: "v", syncedAt: "now", files: { [`../../../../../..${join(outside, "precious")}`]: { hash: "x", mode: "644" as const } } }
    expect(Exit.isFailure(await run(writeSkill(root, "pdf", skillFiles, previous)))).toBe(true)
    expect(readFileSync(join(outside, "precious"), "utf8")).toBe("keep me")
  })

  it("refuses to write into or remove a skill folder that is a symlink", async () => {
    const { outside, root } = setup()
    symlinkSync(outside, join(root, "pdf"))
    expect(Exit.isFailure(await run(writeSkill(root, "pdf", skillFiles, undefined)))).toBe(true)
    expect(Exit.isFailure(await run(removeSkill(root, "pdf")))).toBe(true)
    expect(existsSync(join(outside, "SKILL.md"))).toBe(false)
    expect(readFileSync(join(outside, "precious"), "utf8")).toBe("keep me")
  })

  it("refuses to write through a file or a subfolder that is a symlink", async () => {
    const { outside, root } = setup()
    mkdirSync(join(root, "pdf"))
    symlinkSync(join(outside, "precious"), join(root, "pdf", "SKILL.md"))
    symlinkSync(outside, join(root, "pdf", "scripts"))
    expect(Exit.isFailure(await run(writeSkill(root, "pdf", skillFiles, undefined)))).toBe(true)
    const nested: ReadonlyArray<SkillFile> = [{ path: "scripts/run.sh", mode: "755", bytes: new Uint8Array([1]) }]
    expect(Exit.isFailure(await run(writeSkill(root, "other", nested, undefined)))).toBe(false)
    expect(Exit.isFailure(await run(writeSkill(root, "pdf", nested, undefined)))).toBe(true)
    expect(existsSync(join(outside, "run.sh"))).toBe(false)
    expect(readFileSync(join(outside, "precious"), "utf8")).toBe("keep me")
  })

  it("refuses when the skills root itself has been swapped for a symlink", async () => {
    const { outside, root } = setup()
    const linked = join(root, "skills")
    symlinkSync(outside, linked)
    expect(Exit.isFailure(await run(writeSkill(linked, "pdf", skillFiles, undefined)))).toBe(true)
    expect(existsSync(join(outside, "pdf"))).toBe(false)
  })
})

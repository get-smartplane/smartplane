import { describe, expect, it } from "vitest"
import type { ManagedSkill } from "./manifest"
import { type DesiredSkill, type DiskSkill, nextManaged, planSync, type PlanInput } from "./plan"

const desired = (slug: string, version = `v-${slug}`): DesiredSkill => ({ slug, version })
const owned = (version: string, files: Record<string, string> = { "SKILL.md": "h" }): ManagedSkill => ({
  version,
  files: Object.fromEntries(Object.entries(files).map(([path, hash]) => [path, { hash, mode: "644" as const }])),
  syncedAt: "2026-10-01T00:00:00Z"
})
const onDisk = (files: Record<string, string> = { "SKILL.md": "h" }): DiskSkill => ({ files: new Map(Object.entries(files)) })

const plan = (input: Partial<PlanInput>) =>
  planSync({ desired: [], managed: {}, disk: new Map(), lockedByOthers: new Set(), force: false, ...input })
    .map(({ action, slug }) => `${slug}:${action}`)

describe("planSync", () => {
  it("creates new skills and leaves unmanaged folders alone", () => {
    expect(plan({ desired: [desired("a")], disk: new Map([["mine", onDisk()]]) })).toEqual(["a:create"])
  })

  it("skips a pristine skill whose version is unchanged and updates one whose version moved", () => {
    const disk = new Map([["a", onDisk()], ["b", onDisk()]])
    expect(plan({ desired: [desired("a", "new"), desired("b", "same")], managed: { a: owned("old"), b: owned("same") }, disk }))
      .toEqual(["a:update", "b:unchanged"])
  })

  it("never updates or deletes a managed folder that is or holds a symlink, even with --force", () => {
    const disk = new Map([["a", { ...onDisk(), links: true }], ["b", { ...onDisk(), links: true }]])
    expect(plan({ desired: [desired("a", "new")], managed: { a: owned("old"), b: owned("b") }, disk, force: true }))
      .toEqual(["a:conflict", "b:kept"])
  })

  it("compares whole folders, not just SKILL.md", () => {
    const files = { "SKILL.md": "h", "scripts/run.sh": "s" }
    expect(plan({ desired: [desired("a", "v")], managed: { a: owned("v", files) }, disk: new Map([["a", onDisk(files)]]) })).toEqual(["a:unchanged"])
    const extra = { ...files, "notes.txt": "mine" }
    expect(plan({ desired: [desired("a", "v")], managed: { a: owned("v", files) }, disk: new Map([["a", onDisk(extra)]]) })).toEqual(["a:conflict"])
  })

  it("deletes a managed skill that is no longer granted", () => {
    expect(plan({ managed: { gone: owned("v") }, disk: new Map([["gone", onDisk()]]) })).toEqual(["gone:delete"])
    expect(plan({ managed: { gone: owned("v") } })).toEqual(["gone:forget"])
  })

  it("never overwrites a folder it did not write, even with --force", () => {
    expect(plan({ desired: [desired("a")], disk: new Map([["a", onDisk()]]) })).toEqual(["a:conflict"])
    expect(plan({ desired: [desired("a")], lockedByOthers: new Set(["a"]) })).toEqual(["a:conflict"])
    expect(plan({ desired: [desired("a")], disk: new Map([["a", onDisk()]]), force: true })).toEqual(["a:conflict"])
  })

  it("protects local edits to managed skills unless forced", () => {
    const edited = new Map([["a", onDisk({ "SKILL.md": "edited" })]])
    expect(plan({ desired: [desired("a")], managed: { a: owned("old") }, disk: edited })).toEqual(["a:conflict"])
    expect(plan({ desired: [desired("a")], managed: { a: owned("old") }, disk: edited, force: true })).toEqual(["a:update"])
    expect(plan({ managed: { a: owned("old") }, disk: edited })).toEqual(["a:kept"])
  })

  it("re-creates a managed folder someone deleted", () => {
    expect(plan({ desired: [desired("a")], managed: { a: owned("v-a") } })).toEqual(["a:create"])
  })
})

describe("nextManaged", () => {
  it("records written skills, keeps unchanged and conflicted ones, drops removed ones", () => {
    const managed = { a: owned("old"), c: owned("c"), gone: owned("g") }
    const steps = planSync({
      desired: [desired("a"), desired("b"), desired("c")],
      managed,
      disk: new Map([["a", onDisk()], ["c", onDisk({ "SKILL.md": "edited" })], ["gone", onDisk()]]),
      lockedByOthers: new Set(),
      force: false
    })
    const written = new Map([["a", owned("v-a")], ["b", owned("v-b")]])
    const next = nextManaged(steps, written, managed)
    expect(Object.keys(next).sort()).toEqual(["a", "b", "c"])
    expect(next["a"]?.version).toBe("v-a")
    expect(next["c"]?.version).toBe("c")
  })
})

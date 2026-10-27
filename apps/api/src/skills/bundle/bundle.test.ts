import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { skillMd } from "../../testing/archives"
import type { ArchiveFile } from "../archive/limits"
import { makeBundle } from "./bundle"
import { parseSkillMarkdown } from "./frontmatter"
import { contentHashOf, hashFiles } from "./manifest"
import { selectSkillRoot } from "./root"

const file = (path: string, content = "x", mode: ArchiveFile["mode"] = "644"): ArchiveFile => ({ path, mode, bytes: new TextEncoder().encode(content) })

const repo = [
  file("anthropics-skills-abc123/README.md"),
  file("anthropics-skills-abc123/skills/pdf/SKILL.md", skillMd("pdf", "PDFs")),
  file("anthropics-skills-abc123/skills/pdf/scripts/fill.py"),
  file("anthropics-skills-abc123/skills/docx/SKILL.md", skillMd("docx", "Word"))
]

describe("choosing the skill folder", () => {
  it.effect("unwraps the tarball folder and finds a skill by path or by name under skills/", () =>
    Effect.gen(function*() {
      const byPath = yield* selectSkillRoot(repo, "skills/pdf")
      assert.deepStrictEqual([byPath.folder, byPath.files.map((entry) => entry.path)], ["skills/pdf", ["SKILL.md", "scripts/fill.py"]])
      assert.strictEqual((yield* selectSkillRoot(repo, "docx")).folder, "skills/docx")
    }))

  it.effect("takes the root or the only skill, and names the candidates when ambiguous or missing", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* selectSkillRoot([file("SKILL.md"), file("x/SKILL.md")], undefined)).folder, "")
      assert.strictEqual((yield* selectSkillRoot([file("only/SKILL.md"), file("other.txt")], undefined)).folder, "only")
      const ambiguous = yield* Effect.flip(selectSkillRoot(repo, undefined))
      assert.include(ambiguous.message, "2 skills found (skills/docx, skills/pdf)")
      const missing = yield* Effect.flip(selectSkillRoot(repo, "xlsx"))
      assert.include(missing.message, `no SKILL.md in "xlsx"`)
    }))
})

describe("manifests", () => {
  it.effect("hash the same folder the same way whatever the order or packing", () =>
    Effect.gen(function*() {
      const a = yield* hashFiles([file("b.md", "2"), file("a.md", "1", "755")])
      const b = yield* hashFiles([file("a.md", "1", "755"), file("b.md", "2")])
      assert.deepStrictEqual(a.map((entry) => entry.entry), b.map((entry) => entry.entry))
      const hash = yield* contentHashOf(a.map((entry) => entry.entry))
      assert.strictEqual(hash, yield* contentHashOf(b.map((entry) => entry.entry).reverse()))
      assert.match(hash, /^[0-9a-f]{64}$/)
      // Mode and content are both part of the identity.
      assert.notStrictEqual(hash, yield* contentHashOf((yield* hashFiles([file("b.md", "2"), file("a.md", "1")])).map((entry) => entry.entry)))
      assert.strictEqual(a[0]?.entry.sha256, "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b")
    }))

  it.effect("require a UTF-8 SKILL.md", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.flip(makeBundle({ folder: "", files: [file("README.md")] }))
      assert.include(missing.message, "no SKILL.md")
      const binary = yield* Effect.flip(makeBundle({ folder: "", files: [{ path: "SKILL.md", mode: "644", bytes: new Uint8Array([0xff, 0xfe, 0]) }] }))
      assert.include(binary.message, "not UTF-8")
    }))
})

describe("SKILL.md frontmatter", () => {
  it("reads name, description and arguments, and returns the body without the frontmatter", () => {
    const parsed = parseSkillMarkdown("---\nname: pdf\ndescription: >\n  Fill PDF forms.\nlicense: MIT\narguments:\n  - name: file\n    required: true\n---\nBody {{file}}\n")
    assert.deepStrictEqual(parsed, {
      hasFrontmatter: true,
      name: "pdf",
      description: "Fill PDF forms.\n",
      arguments: [{ name: "file", required: true }],
      body: "Body {{file}}\n"
    })
  })

  it("treats a missing or malformed block as no frontmatter, and ignores fields of the wrong shape", () => {
    assert.isFalse(parseSkillMarkdown("# Just markdown").hasFrontmatter)
    assert.isFalse(parseSkillMarkdown("---\n: [unclosed\n---\nx").hasFrontmatter)
    const odd = parseSkillMarkdown("---\nname: [1, 2]\ndescription: ok\n---\n")
    assert.deepStrictEqual([odd.name, odd.description], [undefined, "ok"])
  })
})

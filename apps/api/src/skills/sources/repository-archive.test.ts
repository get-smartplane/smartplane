import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { gzipBytes, makeTarGz, skillMd } from "../../testing/archives"
import { DefaultArchiveLimits, RepositoryArchiveLimits } from "../archive/limits"
import { writeTar } from "../archive/tar"
import { extractRepositorySkill } from "./repository-archive"

const top = "acme-skills-0123456"
const decoder = new TextDecoder()

/** Incompressible bytes, so the gzip stream is as long as the data and truncating it is detectable. */
const noise = (size: number): Uint8Array => {
  const out = new Uint8Array(size)
  for (let offset = 0; offset < size; offset += 65536) crypto.getRandomValues(out.subarray(offset, Math.min(size, offset + 65536)))
  return out
}

describe("repository archives", () => {
  it.effect("keeps only the chosen skill folder's files", () =>
    Effect.gen(function*() {
      const tarball = yield* Effect.promise(() =>
        makeTarGz([
          { path: `${top}/README.md`, content: "x".repeat(50_000) },
          { path: `${top}/skills/pdf/SKILL.md`, content: skillMd("pdf", "Fill PDFs") },
          { path: `${top}/skills/pdf/scripts/fill.py`, content: "print(1)", mode: "755" },
          { path: `${top}/skills/docx/SKILL.md`, content: skillMd("docx", "Word") }
        ])
      )
      const root = yield* extractRepositorySkill(tarball, "pdf")
      assert.strictEqual(root.folder, "skills/pdf")
      assert.deepStrictEqual(root.files.map((file) => [file.path, file.mode, file.bytes.length > 0]), [["SKILL.md", "644", true], ["scripts/fill.py", "755", true]])
      assert.include(decoder.decode(root.files[0]?.bytes), "name: pdf")
      assert.match((yield* Effect.flip(extractRepositorySkill(tarball, undefined))).message, /2 skills found/)
    }))

  it.effect("aborts a large archive as soon as it passes the cap, without reading the rest", () =>
    Effect.gen(function*() {
      const tar = writeTar([{ path: `${top}/SKILL.md`, mode: "644", bytes: new TextEncoder().encode(skillMd("big", "Big")) }, {
        path: `${top}/data.bin`,
        mode: "644",
        bytes: noise(6 * 1024 * 1024)
      }])
      const gz = yield* Effect.promise(() => gzipBytes(tar))
      // Cut the stream short: reading it to the end would fail as corrupt, so "expands beyond" proves an early stop.
      const truncated = gz.subarray(0, Math.floor(gz.length * 0.75))
      const limits = { repository: { ...RepositoryArchiveLimits, maxExpandedBytes: 1024 * 1024 }, skill: DefaultArchiveLimits }
      assert.match((yield* Effect.flip(extractRepositorySkill(truncated, undefined, limits))).message, /expands beyond 1048576 bytes/)
      assert.match((yield* Effect.flip(extractRepositorySkill(truncated, undefined))).message, /corrupt/, "with room to read it all, the cut shows")
    }))

  it.effect("holds the chosen folder to the skill limits while streaming; big files elsewhere do not count", () =>
    Effect.gen(function*() {
      const tarball = yield* Effect.promise(() =>
        makeTarGz([
          { path: `${top}/assets/video.bin`, content: "v".repeat(8000) },
          { path: `${top}/small/SKILL.md`, content: skillMd("small", "Small") },
          { path: `${top}/large/SKILL.md`, content: skillMd("large", "Large") },
          { path: `${top}/large/data.txt`, content: "d".repeat(4000) }
        ])
      )
      const limits = { repository: RepositoryArchiveLimits, skill: { ...DefaultArchiveLimits, maxExpandedBytes: 2000 } }
      assert.strictEqual((yield* extractRepositorySkill(tarball, "small", limits)).files.length, 1)
      assert.match((yield* Effect.flip(extractRepositorySkill(tarball, "large", limits))).message, /skill is larger than 2000 bytes/)
    }))

  it.effect("applies the archive refusals to the whole repository", () =>
    Effect.gen(function*() {
      assert.match((yield* Effect.flip(extractRepositorySkill(new Uint8Array([1, 2, 3]), undefined))).message, /expected a \.tar\.gz/)
      const traversal = yield* Effect.promise(() => makeTarGz([{ path: "../evil", content: "x" }, { path: "SKILL.md", content: skillMd("a", "b") }]))
      assert.match((yield* Effect.flip(extractRepositorySkill(traversal, undefined))).message, /refused path traversal/)
    }))
})

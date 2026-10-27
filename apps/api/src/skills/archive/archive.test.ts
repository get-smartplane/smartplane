import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { gzipBytes, makeTarGz, makeZip, skillMd, tarEntry, tarOf } from "../../testing/archives"
import { extractArchive } from "./extract"
import { normaliseEntryPath } from "./entry-path"
import { type ArchiveLimits, DefaultArchiveLimits } from "./limits"
import { readTar, writeTar } from "./tar"

const refusal = (bytes: Uint8Array, limits: ArchiveLimits = DefaultArchiveLimits) =>
  Effect.map(Effect.flip(extractArchive(bytes, limits)), (error) => error.message)

const decoder = new TextDecoder()

describe("archive extraction", () => {
  it.effect("unpacks zips (stored and deflated) and tar.gz, keeping only the executable bit", () =>
    Effect.gen(function*() {
      const zip = yield* Effect.promise(() =>
        makeZip([
          { name: "pdf/", unixMode: 0o040755 },
          { name: "pdf/SKILL.md", content: skillMd("pdf", "Read PDFs"), deflate: true },
          { name: "pdf/scripts/run.sh", content: "#!/bin/sh\necho hi\n", unixMode: 0o104777 },
          { name: "__MACOSX/pdf/._SKILL.md", content: "junk" }
        ])
      )
      const files = yield* extractArchive(zip, DefaultArchiveLimits)
      assert.deepStrictEqual(files.map((file) => [file.path, file.mode]), [["pdf/SKILL.md", "644"], ["pdf/scripts/run.sh", "755"]])
      assert.include(decoder.decode(files[0]?.bytes), "name: pdf")

      const tgz = yield* Effect.promise(() => makeTarGz([{ path: "SKILL.md", content: "x" }, { path: `deep/${"a".repeat(120)}.md`, content: "long" }]))
      const unpacked = yield* extractArchive(tgz, DefaultArchiveLimits)
      assert.deepStrictEqual(unpacked.map((file) => file.path), ["SKILL.md", `deep/${"a".repeat(120)}.md`])
    }))

  it.effect("refuses path traversal and absolute paths in zips and tars", () =>
    Effect.gen(function*() {
      for (const name of ["../evil.sh", "a/../../evil.sh", "/etc/passwd", "C:/win.ini", "a\\..\\b"]) {
        const zip = yield* Effect.promise(() => makeZip([{ name, content: "x" }]))
        assert.match(yield* refusal(zip), /refused/, name)
        assert.match(yield* refusal(tarOf(tarEntry(name, "0", "x"))), /refused/, name)
      }
    }))

  it.effect("refuses symlinks, hard links and devices", () =>
    Effect.gen(function*() {
      const zip = yield* Effect.promise(() => makeZip([{ name: "SKILL.md", content: "x" }, { name: "link", content: "/etc/passwd", unixMode: 0o120777 }]))
      assert.match(yield* refusal(zip), /"link" is a link/)
      assert.match(yield* refusal(tarOf(tarEntry("link", "2", "", "/etc/passwd"))), /is a link/)
      assert.match(yield* refusal(tarOf(tarEntry("hard", "1", "", "SKILL.md"))), /is a link/)
      assert.match(yield* refusal(tarOf(tarEntry("dev", "3"))), /not a regular file/)
    }))

  it.effect("stops zip bombs: lying sizes, oversized entries and total expansion", () =>
    Effect.gen(function*() {
      const zeros = new Uint8Array(1024 * 1024)
      const lying = yield* Effect.promise(() => makeZip([{ name: "bomb", content: zeros, deflate: true, declaredSize: 10 }]))
      assert.match(yield* refusal(lying), /expands beyond 10 bytes/)
      const small = { ...DefaultArchiveLimits, maxFileBytes: 1000, maxExpandedBytes: 1500 }
      const big = yield* Effect.promise(() => makeZip([{ name: "big", content: zeros, deflate: true }]))
      assert.match(yield* refusal(big, small), /expands beyond|larger than/)
      const gzBomb = yield* Effect.promise(() => gzipBytes(writeTar([{ path: "bomb", mode: "644", bytes: new Uint8Array(4 * 1024 * 1024) }])))
      assert.match(yield* refusal(gzBomb, { ...DefaultArchiveLimits, maxExpandedBytes: 1024 }), /expands beyond 1024 bytes/)
      // Zeros after the end-of-archive blocks are never read, however many there are.
      const padded = yield* Effect.promise(() => gzipBytes(new Uint8Array(4 * 1024 * 1024)))
      assert.deepStrictEqual(yield* extractArchive(padded, { ...DefaultArchiveLimits, maxExpandedBytes: 1024 }), [])
    }))

  it.effect("caps compressed size and file count, and rejects what is not an archive", () =>
    Effect.gen(function*() {
      const zip = yield* Effect.promise(() => makeZip(Array.from({ length: 4 }, (_, index) => ({ name: `f${index}`, content: "x" }))))
      assert.match(yield* refusal(zip, { ...DefaultArchiveLimits, maxFiles: 3 }), /more than 3 files/)
      assert.match(yield* refusal(zip, { ...DefaultArchiveLimits, maxCompressedBytes: 10 }), /larger than 10 bytes/)
      assert.match(yield* refusal(new TextEncoder().encode("hello")), /expected a \.zip or \.tar\.gz/)
      const duplicate = yield* Effect.promise(() => makeZip([{ name: "a", content: "1" }, { name: "./a", content: "2" }]))
      assert.match(yield* refusal(duplicate), /appears twice/)
    }))

  it.effect("round-trips the bundle tar writer through the reader", () =>
    Effect.gen(function*() {
      const entries = yield* readTar(writeTar([{ path: "SKILL.md", mode: "644", bytes: new TextEncoder().encode("hi") }]))
      assert.deepStrictEqual(entries.map((entry) => [entry.name, entry.kind, entry.mode, decoder.decode(entry.data)]), [["SKILL.md", "file", 0o644, "hi"]])
    }))
})

describe("entry paths", () => {
  it("drops `.` and empty segments and refuses control characters", () => {
    assert.deepStrictEqual(normaliseEntryPath("./a//b/./c.md"), { path: "a/b/c.md" })
    assert.deepStrictEqual("refused" in normaliseEntryPath("a\u0000b"), true)
  })
})

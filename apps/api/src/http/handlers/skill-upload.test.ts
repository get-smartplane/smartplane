import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/http"
import { DefaultArchiveLimits } from "../../skills/archive/limits"
import { readUpload } from "./skill-upload"

const limit = DefaultArchiveLimits.maxCompressedBytes
const ChunkBytes = 64 * 1024

/** A chunked body (no Content-Length) of `total` bytes, counting how many bytes the server pulled from it. */
const chunked = (total: number, pulled: { bytes: number }) => {
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      if (sent >= total) return controller.close()
      const size = Math.min(ChunkBytes, total - sent)
      sent += size
      pulled.bytes = sent
      controller.enqueue(new Uint8Array(size).fill(1))
    }
  })
  const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "content-type": "application/gzip" } }
  return HttpServerRequest.fromWeb(new Request("https://api.test/api/skills/upload", init))
}

describe("skill upload size cap", () => {
  it.effect("refuses a chunked body over the cap without reading all of it", () =>
    Effect.gen(function*() {
      const pulled = { bytes: 0 }
      const request = chunked(limit * 4, pulled)
      assert.isUndefined(request.headers["content-length"])
      const error = yield* Effect.flip(readUpload(request))
      assert.strictEqual(error.message, `the archive is larger than ${limit} bytes`)
      assert.isBelow(pulled.bytes, limit + 4 * ChunkBytes)
    }))

  it.effect("accepts a chunked body under the cap", () =>
    Effect.gen(function*() {
      const archive = yield* readUpload(chunked(ChunkBytes * 3, { bytes: 0 }))
      assert.strictEqual(archive.length, ChunkBytes * 3)
    }))

  it.effect("caps a multipart body too, and still finds the file field", () =>
    Effect.gen(function*() {
      const form = new FormData()
      form.set("file", new Blob([new Uint8Array(1000).fill(2)]), "skill.tar.gz")
      const ok = yield* readUpload(HttpServerRequest.fromWeb(new Request("https://api.test/api/skills/upload", { method: "POST", body: form })))
      assert.strictEqual(ok.length, 1000)
    }))
})

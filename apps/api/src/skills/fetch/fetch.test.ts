import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option, Redacted, Result } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { downloadTarball, resolveCommit } from "../sources/github"
import { SkillFetcher } from "./fetcher"
import { screenUrl } from "./safe-url"

describe("SSRF screen", () => {
  it("accepts public https URLs only", () => {
    assert.isTrue(Result.isSuccess(screenUrl("https://raw.githubusercontent.com/a/b/main/SKILL.md")))
    for (const url of [
      "http://example.com/SKILL.md",
      "ftp://example.com/x",
      "https://localhost/x",
      "https://api.localhost/x",
      "https://127.0.0.1/x",
      "https://2130706433/x",
      "https://0x7f.1/x",
      "https://10.0.0.8/x",
      "https://172.16.4.1/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://100.64.0.1/x",
      "https://[::1]/x",
      "https://[fd00::1]/x",
      "https://metadata.google.internal/x",
      "https://printer.local/x",
      "https://intranet/x",
      "https://user:pw@example.com/x",
      "https://example.com:8443/x",
      "not a url"
    ]) {
      assert.isTrue(Result.isFailure(screenUrl(url)), url)
    }
  })
})

interface Seen {
  readonly url: string
  readonly authorization: string | undefined
}

/** An HttpClient answering from a table of URL → Response, recording what was asked. */
const fakeHttp = (routes: Readonly<Record<string, () => Response>>, seen: Array<Seen>) =>
  SkillFetcher.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, HttpClient.make((request, url) =>
    Effect.sync(() => {
      seen.push({ url: url.toString(), authorization: request.headers.authorization })
      const route = routes[url.toString()]
      return HttpClientResponse.fromWeb(request, route === undefined ? new Response("missing", { status: 404 }) : route())
    })
  ))))

const sha = "a".repeat(40)

describe("skill downloads", () => {
  it.effect("follows redirects only to allowed hosts, and drops credentials when the host changes", () => {
    const seen: Array<Seen> = []
    return Effect.gen(function*() {
      const bytes = yield* downloadTarball("acme/private", sha, Option.some(Redacted.make("ghp_secret")))
      assert.strictEqual(new TextDecoder().decode(bytes), "tarball")
      assert.deepStrictEqual(seen, [
        { url: `https://api.github.com/repos/acme/private/tarball/${sha}`, authorization: "Bearer ghp_secret" },
        { url: "https://codeload.github.com/acme/private/legacy.tar.gz/x?token=t", authorization: undefined }
      ])
    }).pipe(Effect.provide(fakeHttp({
      [`https://api.github.com/repos/acme/private/tarball/${sha}`]: () =>
        new Response(null, { status: 302, headers: { location: "https://codeload.github.com/acme/private/legacy.tar.gz/x?token=t" } }),
      "https://codeload.github.com/acme/private/legacy.tar.gz/x?token=t": () => new Response("tarball")
    }, seen)))
  })

  it.effect("refuses redirects to other hosts and to private addresses", () =>
    Effect.gen(function*() {
      const fetcher = yield* SkillFetcher
      const elsewhere = yield* Effect.flip(fetcher.get("https://skills.example.com/a.zip", { maxBytes: 100 }))
      assert.include(elsewhere.message, "another host (evil.example.net)")
      const metadata = yield* Effect.flip(fetcher.get("https://skills.example.com/b.zip", { maxBytes: 100 }))
      assert.include(metadata.message, "private or reserved")
      const large = yield* Effect.flip(fetcher.get("https://skills.example.com/big", { maxBytes: 100 }))
      assert.include(large.message, "larger than 100 bytes")
    }).pipe(Effect.provide(fakeHttp({
      "https://skills.example.com/a.zip": () => new Response(null, { status: 302, headers: { location: "https://evil.example.net/a.zip" } }),
      "https://skills.example.com/b.zip": () => new Response(null, { status: 307, headers: { location: "https://169.254.169.254/latest" } }),
      "https://skills.example.com/big": () => new Response("x".repeat(500))
    }, []))))

  it.effect("resolves a ref to its commit SHA, and explains a missing repo or ref", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* resolveCommit("anthropics/skills", undefined, Option.none()), sha)
      const missing = yield* Effect.flip(resolveCommit("anthropics/skills", "nope", Option.none()))
      assert.include(missing.message, "GitHub could not find anthropics/skills")
      // A missing ref, a ref GitHub refuses as invalid and a token without access all read the same.
      const invalid = yield* Effect.flip(resolveCommit("anthropics/skills", "bad..ref", Option.none()))
      const unauthorised = yield* Effect.flip(resolveCommit("acme/private", "main", Option.some(Redacted.make("ghp_x"))))
      assert.deepStrictEqual([invalid.message, unauthorised.message.replace("acme/private", "anthropics/skills")], [missing.message, missing.message])
    }).pipe(Effect.provide(fakeHttp({
      "https://api.github.com/repos/anthropics/skills/commits/HEAD": () => new Response(`${sha}\n`),
      "https://api.github.com/repos/anthropics/skills/commits/bad..ref": () => new Response("", { status: 422 }),
      "https://api.github.com/repos/acme/private/commits/main": () => new Response("", { status: 401 })
    }, []))))
})

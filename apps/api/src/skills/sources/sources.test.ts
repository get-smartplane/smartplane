import { assert, describe, it } from "@effect/vitest"
import { ResourceId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { actorOf } from "../../audit/actor"
import { makeTarGz, skillMd } from "../../testing/archives"
import { orgId, userPrincipal } from "../../testing/fixtures"
import { fakeSecrets } from "../../testing/gateway-fakes"
import { SkillFetcher } from "../fetch/fetcher"
import { SkillSources } from "./skill-sources"

const sha = "0123456789abcdef0123456789abcdef01234567"
const actor = actorOf(userPrincipal())

const sourcesWith = (routes: Readonly<Record<string, () => Promise<Response>>>) =>
  SkillSources.layer.pipe(
    Layer.provide(SkillFetcher.layer),
    Layer.provide([
      fakeSecrets({}),
      Layer.succeed(HttpClient.HttpClient, HttpClient.make((request, url) =>
        Effect.promise(async () => {
          const route = routes[url.toString()]
          return HttpClientResponse.fromWeb(request, route === undefined ? new Response("missing", { status: 404 }) : await route())
        })))
    ])
  )

const tarball = () =>
  makeTarGz([
    { path: `anthropics-skills-${sha.slice(0, 7)}/README.md`, content: "# Skills" },
    { path: `anthropics-skills-${sha.slice(0, 7)}/skills/pdf/SKILL.md`, content: skillMd("pdf", "Fill PDFs") },
    { path: `anthropics-skills-${sha.slice(0, 7)}/skills/pdf/scripts/fill.py`, content: "print(1)", mode: "755" },
    { path: `anthropics-skills-${sha.slice(0, 7)}/skills/docx/SKILL.md`, content: skillMd("docx", "Word") }
  ]).then((bytes) => new Response(new Uint8Array(bytes)))

describe("skill sources", () => {
  it.effect("fetches one skill folder of a public GitHub repo, pinned to the resolved commit", () =>
    Effect.gen(function*() {
      const fetched = yield* SkillSources.use((sources) =>
        sources.fetch(orgId, { kind: "skill", source: "github", description: "", repo: "anthropics/skills", path: "pdf", ref: "main" }, actor))
      assert.deepStrictEqual(fetched.snapshot, { type: "github", repo: "anthropics/skills", commit: sha, ref: "main", path: "skills/pdf" })
      assert.deepStrictEqual(fetched.root.files.map((file) => [file.path, file.mode]), [["SKILL.md", "644"], ["scripts/fill.py", "755"]])
    }).pipe(Effect.provide(sourcesWith({
      "https://api.github.com/repos/anthropics/skills/commits/main": async () => new Response(sha),
      [`https://codeload.github.com/anthropics/skills/tar.gz/${sha}`]: tarball
    }))))

  it.effect("takes a link to a single SKILL.md, and refuses a link to an HTML page", () =>
    Effect.gen(function*() {
      const sources = yield* SkillSources
      const single = yield* sources.fetch(orgId, { kind: "skill", source: "link", description: "", url: "https://example.com/SKILL.md" }, actor)
      assert.deepStrictEqual([single.snapshot, single.root.files.map((file) => file.path)], [{ type: "link", url: "https://example.com/SKILL.md" }, ["SKILL.md"]])
      const page = yield* Effect.flip(sources.fetch(orgId, { kind: "skill", source: "link", description: "", url: "https://example.com/page" }, actor))
      assert.include(page.message, "neither a SKILL.md file nor")
    }).pipe(Effect.provide(sourcesWith({
      "https://example.com/SKILL.md": async () => new Response(skillMd("notes", "Take notes")),
      "https://example.com/page": async () => new Response("<!doctype html><html></html>")
    }))))

  it.effect("needs the token secret to exist for private repositories", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.flip(SkillSources.use((sources) =>
        sources.fetch(orgId, { kind: "skill", source: "github", description: "", repo: "acme/private", tokenSecretId: ResourceId.make("res_nosecret01") }, actor)))
      assert.include(missing.message, "token secret is missing")
    }).pipe(Effect.provide(sourcesWith({}))))
})

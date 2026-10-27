import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { makeZip } from "../testing/archives"
import { otherUserId, userPrincipal } from "../testing/fixtures"
import { skillWorld, uploadedSkill, uploadVersion } from "../testing/skill-services"
import { SkillDownloads } from "./download"
import { SkillVersions } from "./versions"

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
/** The fixture user holds a `read` grant on `uploadedSkill`; Eve holds none. */
const grantee = userPrincipal()
const eve = userPrincipal({ userId: otherUserId, email: "eve@example.com" })

const archive = Effect.promise(() => makeZip([{ name: "SKILL.md", content: "---\nname: pdf\ndescription: Fill PDFs\n---\nFill it.\n" }]))

const tagOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.match(effect, { onFailure: (error) => error._tag, onSuccess: () => "ok" })

/** A fresh skill world (one database per test) with the CLI's bundle download on top. */
const withDownloads = () => SkillDownloads.layer.pipe(Layer.provideMerge(skillWorld({ scanning: "off" }).layer))

describe("skill endpoints under resource visibility", () => {
  it.effect("grantees still list versions, read them and download the bundle", () =>
    Effect.gen(function*() {
      yield* uploadVersion(admin, yield* archive)
      const versions = yield* SkillVersions
      const downloads = yield* SkillDownloads
      assert.strictEqual((yield* versions.list(grantee, uploadedSkill.id)).length, 1)
      assert.strictEqual((yield* versions.get(grantee, uploadedSkill.id, 1)).version.version, 1)
      assert.strictEqual((yield* downloads.download(grantee, uploadedSkill.id)).slug, "pdf-tools")
    }).pipe(Effect.provide(withDownloads())))

  it.effect("members without a grant get NotFound, never Forbidden", () =>
    Effect.gen(function*() {
      yield* uploadVersion(admin, yield* archive)
      const versions = yield* SkillVersions
      const downloads = yield* SkillDownloads
      assert.strictEqual(yield* tagOf(versions.list(eve, uploadedSkill.id)), "NotFound")
      assert.strictEqual(yield* tagOf(versions.get(eve, uploadedSkill.id, 1)), "NotFound")
      assert.strictEqual(yield* tagOf(downloads.download(eve, uploadedSkill.id)), "NotFound")
    }).pipe(Effect.provide(withDownloads())))
})

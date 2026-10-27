import { assert, describe, it } from "@effect/vitest"
import { type GithubSkillConfig, type ResourceId } from "@pc/domain"
import { Effect, Exit, Layer } from "effect"
import { Resources } from "../resources/resources"
import { ResourcesRepo } from "../resources/resources-repo"
import { makeZip, skillMd } from "../testing/archives"
import { userPrincipal } from "../testing/fixtures"
import { resourceOf } from "../testing/gateway-fakes"
import { skillWorld } from "../testing/skill-services"
import { Skills } from "./skills"
import { SkillSources } from "./sources/skill-sources"

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const reader = userPrincipal({ permissions: ["resources:read"] })
const github: GithubSkillConfig = { kind: "skill", source: "github", description: "", repo: "acme/skills" }
const githubSkill = resourceOf("res_skillgh0001", "GitHub skill", github)

/**
 * `Skills` over the real ingest and storage, with `Resources` faked: `create` hands back a resource that
 * is (or, with `store: false`, is not) in the database, so storing its version fails on the foreign key.
 */
const world = (options: { readonly store: boolean }) => {
  const blobs = new Map<string, Uint8Array>()
  const created: Array<string> = []
  const removed: Array<ResourceId> = []
  const skills = skillWorld({ scanning: "off", blobs })
  const unused = () => Effect.die("unused")
  const resources = Layer.effect(Resources, Effect.gen(function*() {
    const repo = yield* ResourcesRepo
    return Resources.of({
      create: (_principal, input) =>
        Effect.gen(function*() {
          created.push(input.name)
          const resource = { ...resourceOf("res_skillnew001", input.name, input.config.kind === "skill" ? input.config : { kind: "secret" }), description: input.description }
          if (options.store) yield* Effect.orDie(repo.insert(resource))
          return resource
        }),
      remove: (_principal, id) => Effect.sync(() => void removed.push(id)),
      list: unused,
      get: unused,
      update: unused,
      rotateSecret: unused
    })
  }))
  const sources = Layer.succeed(SkillSources, { fetch: unused, latestCommit: () => Effect.succeed("b".repeat(40)) })
  const seeded = Layer.effectDiscard(Effect.orDie(ResourcesRepo.use((repo) => repo.insert(githubSkill))))
  const layer = Layer.provideMerge(seeded, Skills.layer.pipe(Layer.provideMerge(Layer.mergeAll(resources, sources)), Layer.provideMerge(skills.layer)))
  return { blobs, created, removed, events: skills.events, layer }
}

const zip = (skill: string | Uint8Array) => Effect.promise(() => makeZip([{ name: "pdf/SKILL.md", content: skill }, { name: "pdf/run.sh", content: "echo hi\n" }]))

describe("creating a skill", () => {
  it.effect("validates the bundle before a resource exists", () => {
    const test = world({ store: true })
    return Effect.gen(function*() {
      const latin1 = new Uint8Array([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a])
      const bad = yield* zip(latin1)
      const refused = yield* Effect.flip(Skills.use((skills) => skills.upload(admin, { name: "Invoice tools" }, bad)))
      assert.include(refused.message, "not UTF-8")
      assert.deepStrictEqual([test.created, test.blobs.size], [[], 0])

      const good = yield* zip(skillMd("pdf", "Fill PDFs"))
      const made = yield* Skills.use((skills) => skills.upload(admin, { name: "Invoice tools" }, good))
      assert.deepStrictEqual([made.resource.description, made.version.version, test.blobs.size], ["Fill PDFs", 1, 2])
    }).pipe(Effect.provide(test.layer))
  })

  it.effect("removes the new resource and the blobs it wrote when storing the version fails", () => {
    const test = world({ store: false })
    return Effect.gen(function*() {
      const good = yield* zip(skillMd("pdf", "Fill PDFs"))
      const exit = yield* Effect.exit(Skills.use((skills) => skills.upload(admin, { name: "Invoice tools" }, good)))
      assert.isTrue(Exit.isFailure(exit))
      assert.deepStrictEqual([test.created, test.removed, test.blobs.size], [["Invoice tools"], ["res_skillnew001"], 0])
    }).pipe(Effect.provide(test.layer))
  })
})

describe("checking a GitHub skill for updates", () => {
  it.effect("needs resources:manage, since it uses the org's GitHub token", () => {
    const test = world({ store: true })
    return Effect.gen(function*() {
      const skills = yield* Skills
      assert.strictEqual((yield* Effect.flip(skills.checkUpdates(reader, githubSkill.id)))._tag, "Forbidden")
      assert.deepInclude(yield* skills.checkUpdates(admin, githubSkill.id), { latestCommit: "b".repeat(40), updateAvailable: true })
    }).pipe(Effect.provide(test.layer))
  })
})

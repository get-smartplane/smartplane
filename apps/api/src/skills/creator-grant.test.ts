import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type ResourceId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { GrantsRepo } from "../access/grants-repo"
import { makeZip, skillMd } from "../testing/archives"
import { orgId, userId, userPrincipal } from "../testing/fixtures"
import { resourceServices } from "../testing/resource-world"
import { seedOrg } from "../testing/seed"
import { extractArchive } from "./archive/extract"
import { DefaultArchiveLimits } from "./archive/limits"
import { selectSkillRoot } from "./bundle/root"
import { SkillIngest } from "./ingest"
import { SkillScanQueue } from "./scan/queue"
import { Skills } from "./skills"
import { SkillSources } from "./sources/skill-sources"
import { SkillBlobs } from "./storage/blobs"
import { SkillPolicyRepo } from "./storage/policy-repo"
import { SkillVersionsRepo } from "./storage/versions-repo"

const admin = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
const archive = Effect.promise(() => makeZip([{ name: "pdf/SKILL.md", content: skillMd("pdf", "Fill PDFs") }]))
const rootOf = (zip: Uint8Array) => Effect.orDie(Effect.flatMap(extractArchive(zip, DefaultArchiveLimits), (files) => selectSkillRoot(files, undefined)))

/** The real `Skills` and `Resources` over one database; the source fetch is faked to return a valid bundle. */
const world = (events: Array<AuditEvent>) => {
  const sources = Layer.succeed(SkillSources, {
    fetch: () => Effect.map(Effect.flatMap(archive, rootOf), (root) => ({ root, snapshot: { type: "link" as const, url: "https://example.com/pdf.zip" } })),
    latestCommit: () => Effect.die("unused")
  })
  const queue = Layer.succeed(SkillScanQueue, { send: () => Effect.void })
  return Skills.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(sources, SkillIngest.layer)),
    Layer.provideMerge(Layer.mergeAll(SkillVersionsRepo.layer, SkillPolicyRepo.layer, SkillBlobs.memory(), queue)),
    Layer.provideMerge(resourceServices(events))
  )
}

const creatorGrants = (resourceId: ResourceId) =>
  Effect.map(GrantsRepo.use((repo) => repo.list(orgId, { resourceId })), (grants) => grants.map((grant) => [grant.subject, grant.action, grant.expiresAt]))

describe("skills created from a source give their creator access", () => {
  it.effect("link, GitHub and upload each make exactly one creator grant", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seedOrg
      const skills = yield* Skills
      const link = yield* skills.createFrom(admin, { name: "From a link", description: "", projectId: null }, { kind: "skill", source: "link", description: "", url: "https://example.com/pdf.zip" })
      const github = yield* skills.create(admin, { name: "From GitHub", description: "", projectId: null, source: { type: "github", repo: "acme/skills" } })
      const upload = yield* skills.upload(admin, { name: "Uploaded" }, yield* archive)
      for (const { resource } of [link, github, upload]) {
        assert.deepStrictEqual(yield* creatorGrants(resource.id), [[{ type: "user", id: userId }, "admin", null]])
      }
      assert.deepStrictEqual(events.filter((event) => event.type === "grant.created").map((event) => event.data.reason), ["creator", "creator", "creator"])
    }).pipe(Effect.provide(world(events)))
  })
})

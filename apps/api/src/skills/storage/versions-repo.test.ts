import { assert, describe, it } from "@effect/vitest"
import { emptyScanSummary, SkillVersionId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { ResourcesRepo } from "../../resources/resources-repo"
import { now, userId } from "../../testing/fixtures"
import { seedOrg } from "../../testing/seed"
import { skillStorage } from "../../testing/skill-content"
import { uploadedSkill } from "../../testing/skill-services"
import { type NewSkillVersion, SkillVersionsRepo } from "./versions-repo"

const draft: NewSkillVersion = {
  id: SkillVersionId.make("skv_version001"),
  orgId: uploadedSkill.orgId,
  resourceId: uploadedSkill.id,
  source: { type: "upload" },
  contentHash: "a".repeat(64),
  files: [],
  name: "pdf",
  description: "Fill PDFs",
  scanStatus: "skipped",
  scanSummary: emptyScanSummary,
  override: null,
  createdBy: userId,
  createdAt: now
}

const layer = Layer.provideMerge(
  Layer.effectDiscard(Effect.gen(function*() {
    yield* seedOrg
    yield* Effect.orDie(ResourcesRepo.use((repo) => repo.insert(uploadedSkill)))
  })),
  Layer.mergeAll(ResourcesRepo.layer, SkillVersionsRepo.layer).pipe(Layer.provideMerge(skillStorage()))
)

describe("SkillVersionsRepo.insert", () => {
  it.effect("numbers versions in order and turns a unique clash into Conflict instead of a defect", () =>
    Effect.gen(function*() {
      const repo = yield* SkillVersionsRepo
      assert.strictEqual(yield* repo.insert(draft), 1)
      assert.strictEqual(yield* repo.insert({ ...draft, id: SkillVersionId.make("skv_version002") }), 2)
      const clash = yield* Effect.flip(repo.insert(draft))
      assert.deepStrictEqual([clash._tag, clash.message], ["Conflict", "another version of this skill was added at the same time; try again"])
    }).pipe(Effect.provide(layer)))
})

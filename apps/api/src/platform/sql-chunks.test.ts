import { assert, describe, it } from "@effect/vitest"
import { ResourceId, TeamId } from "@pc/domain"
import { DateTime, Effect, Layer } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { GrantsRepo } from "../access/grants-repo"
import { subjectKey } from "../access/subjects"
import { ResourcesRepo } from "../resources/resources-repo"
import { SkillVersionsRepo } from "../skills/storage/versions-repo"
import { TestDatabase } from "../testing/database"
import { now, orgId, userPrincipal } from "../testing/fixtures"
import { insertRow, seedOrg, seedResource, seedUserGrant } from "../testing/seed"
import { chunksOf } from "./chunks"
import { inChunks } from "./sql-chunks"

const layer = AccessPolicy.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(ResourcesRepo.layer, GrantsRepo.layer, SkillVersionsRepo.layer)),
  Layer.provideMerge(TestDatabase)
)

const ids = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(8, "0")}`)

/** 250 granted resources: well past D1's 100 bound parameters per statement (the test D1 enforces it too). */
const seedGranted = (count: number) =>
  Effect.gen(function*() {
    yield* seedOrg
    const resourceIds = ids(count, "res_")
    yield* Effect.forEach(resourceIds, (id, index) => Effect.andThen(seedResource(id), seedUserGrant(`grt_${String(index).padStart(8, "0")}`, id)), { discard: true })
    return resourceIds
  })

describe("id lists in IN (…) are chunked under D1's parameter limit", () => {
  it("chunksOf splits into groups of at most the size", () => {
    assert.deepStrictEqual(chunksOf([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
    assert.deepStrictEqual(chunksOf([], 2), [])
  })

  it.effect("inChunks runs one query per 90 ids and skips the query for none", () =>
    Effect.gen(function*() {
      const sizes: Array<number> = []
      const rows = yield* inChunks(ids(250, "x"), (chunk) => Effect.sync(() => (sizes.push(chunk.length), chunk)))
      assert.deepStrictEqual(sizes, [90, 90, 70])
      assert.strictEqual(rows.length, 250)
      yield* inChunks([], () => Effect.die("no query for an empty list"))
    }))

  it.effect("access resolves for a principal with 250 granted resources", () =>
    Effect.gen(function*() {
      const resourceIds = yield* seedGranted(250)
      const access = yield* AccessPolicy.use((policy) => policy.resolve(userPrincipal({ permissions: [] })))
      assert.strictEqual(access.size, 250)
      assert.deepStrictEqual([...access.keys()].sort(), resourceIds)
    }).pipe(Effect.provide(layer)))

  it.effect("ResourcesRepo.findMany and SkillVersionsRepo.active take 250 ids", () =>
    Effect.gen(function*() {
      const resourceIds = (yield* seedGranted(250)).map((id) => ResourceId.make(id))
      const found = yield* ResourcesRepo.use((repo) => repo.findMany(orgId, resourceIds))
      assert.strictEqual(found.length, 250)
      const active = yield* SkillVersionsRepo.use((repo) => repo.active(orgId, resourceIds))
      assert.strictEqual(active.length, 0)
    }).pipe(Effect.provide(layer)))

  it.effect("grants resolve for a principal in 120 teams", () =>
    Effect.gen(function*() {
      yield* seedOrg
      yield* seedResource("res_teamowned")
      const teams = ids(120, "team_")
      const at = DateTime.formatIso(now)
      yield* Effect.forEach(teams, (id) => insertRow("teams", { id, orgId, name: id, slug: id, createdAt: at }), { discard: true })
      yield* insertRow("grants", { id: "grt_teamgrant", orgId, subject: JSON.stringify({ type: "team", id: teams[119] }), subjectType: "team", subjectId: teams[119], resourceId: "res_teamowned", action: "read", conditions: "{}", createdBy: "usr_testuser01", createdAt: at })
      const subjects = teams.map((id) => subjectKey({ type: "team", id: TeamId.make(id) }))
      const grants = yield* GrantsRepo.use((repo) => repo.forSubjects(orgId, subjects))
      assert.deepStrictEqual(grants.map((grant) => grant.id), ["grt_teamgrant"])
    }).pipe(Effect.provide(layer)))
})

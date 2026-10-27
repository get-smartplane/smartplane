import { assert, describe, it } from "@effect/vitest"
import { Team, TeamId } from "@pc/domain"
import { Effect, Layer, Option } from "effect"
import { now, orgId } from "../testing/fixtures"
import { TestDatabase } from "../testing/database"
import { seedOrg } from "../testing/seed"
import { TeamsRepo } from "./teams-repo"

const layer = Layer.provideMerge(Layer.effectDiscard(seedOrg), TeamsRepo.layer.pipe(Layer.provideMerge(TestDatabase)))

describe("TeamsRepo.insert", () => {
  it.effect("accepts a full Team, whose computed memberCount has no column", () =>
    Effect.gen(function*() {
      const repo = yield* TeamsRepo
      const team = Team.make({
        id: TeamId.make("team_platform1"),
        orgId,
        name: "Platform",
        slug: "platform",
        directoryGroupId: null,
        memberCount: 0,
        createdAt: now
      })
      yield* repo.insert(team)
      const stored = yield* repo.find(orgId, team.id)
      assert.deepStrictEqual(Option.map(stored, (found) => [found.name, found.memberCount]), Option.some(["Platform", 0]))
    }).pipe(Effect.provide(layer)))
})

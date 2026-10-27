import { type Team, TeamId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { ConnectionResolver } from "../connections/resolver"
import { TeamsRepo } from "../org/teams-repo"
import { now, orgId } from "./fixtures"

/** A resolver for resources that use no connections (shared static secrets); any use is a test bug. */
export const noConnections = Layer.succeed(ConnectionResolver, {
  context: () => Effect.succeed(null),
  credential: () => Effect.die("no connection-backed resource in this test")
})

/** Teams by name, for guard state; every other TeamsRepo call is a test bug. */
export const fakeTeams = (teams: ReadonlyArray<Team>) => {
  const unused = () => Effect.die("TeamsRepo call not used by this test")
  return Layer.succeed(TeamsRepo, {
    list: () => Effect.succeed(teams),
    find: unused,
    insert: unused,
    rename: unused,
    members: unused,
    addMember: unused,
    removeMember: unused,
    teamIdsOf: unused
  })
}

export const teamOf = (id: string, name: string): Team => ({
  id: TeamId.make(id),
  orgId,
  name,
  slug: name.toLowerCase(),
  directoryGroupId: null,
  memberCount: 1,
  createdAt: now
})

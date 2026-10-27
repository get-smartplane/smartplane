import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Conflict, Forbidden, NotFound } from "../errors"
import { TeamId, UserId } from "../ids"
import { AddTeamMember, CreateTeam, Team, TeamMember, UpdateTeam } from "../org/team"
import { Authentication } from "./security"

const params = { id: TeamId }

/** Directory-synced teams (`directoryGroupId` set) reject manual membership changes with Conflict. */
export class TeamsApi extends HttpApiGroup.make("teams")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(Team) }),
    HttpApiEndpoint.post("create", "/", {
      payload: CreateTeam,
      success: Team.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, Conflict]
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params,
      payload: UpdateTeam,
      success: Team,
      error: [Forbidden, NotFound, Conflict]
    }),
    /** Also revokes every grant whose subject is the team. */
    HttpApiEndpoint.delete("remove", "/:id", { params, error: [Forbidden, NotFound] }),
    HttpApiEndpoint.get("listMembers", "/:id/members", {
      params,
      success: Schema.Array(TeamMember),
      error: NotFound
    }),
    HttpApiEndpoint.post("addMember", "/:id/members", {
      params,
      payload: AddTeamMember,
      success: TeamMember.pipe(HttpApiSchema.status(201)),
      error: [Forbidden, NotFound, Conflict]
    }),
    HttpApiEndpoint.delete("removeMember", "/:id/members/:userId", {
      params: { ...params, userId: UserId },
      error: [Forbidden, NotFound, Conflict]
    })
  )
  .middleware(Authentication)
  .prefix("/teams")
{}

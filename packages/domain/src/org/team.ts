import { Schema } from "effect"
import { OrgId, TeamId, UserId } from "../ids"
import { Email, Name, Slug, Timestamp } from "../primitives"

export class Team extends Schema.Opaque<Team>()(
  Schema.Struct({
    id: TeamId,
    orgId: OrgId,
    name: Name,
    slug: Slug,
    /** Set when membership is driven by a WorkOS Directory Sync group; then it is read-only here. */
    directoryGroupId: Schema.NullOr(Schema.String),
    memberCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    createdAt: Timestamp
  }).annotate({ identifier: "Team" })
) {}

export class TeamMember extends Schema.Opaque<TeamMember>()(
  Schema.Struct({
    teamId: TeamId,
    userId: UserId,
    email: Email,
    name: Schema.NullOr(Schema.String),
    addedAt: Timestamp
  }).annotate({ identifier: "TeamMember" })
) {}

export const CreateTeam = Schema.Struct({ name: Name }).annotate({ identifier: "CreateTeam" })
export type CreateTeam = typeof CreateTeam.Type

export const UpdateTeam = Schema.Struct({ name: Name }).annotate({ identifier: "UpdateTeam" })
export type UpdateTeam = typeof UpdateTeam.Type

/** Only active members of the org can join one of its teams. */
export const AddTeamMember = Schema.Struct({ userId: UserId }).annotate({ identifier: "AddTeamMember" })
export type AddTeamMember = typeof AddTeamMember.Type

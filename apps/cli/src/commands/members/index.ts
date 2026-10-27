import { Email, Member, MembershipId, RoleSlug } from "@pc/domain"
import { Effect, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { yesFlag } from "../../app/common-flags"
import { formatTime } from "../../app/format"
import { emit } from "../../app/output"
import { confirm } from "../../app/secret-input"
import { tableOr } from "../../app/table"
import { findMember } from "../../resolve/entities"

const memberTable = (members: ReadonlyArray<Member>) =>
  tableOr(
    "No members.",
    ["id", "email", "name", "role", "status", "source", "last seen"],
    members.map((m) => [m.id, m.email, m.name, m.role, m.status, m.source, formatTime(m.lastSeenAt)])
  )

const listMembers = Command.make("ls", {}, () =>
  Effect.gen(function*() {
    yield* emit(Schema.Array(Member), yield* (yield* api).members.list(), memberTable)
  })).pipe(Command.withDescription("List org members, including invited and offboarded ones"), Command.withAlias("list"))

const inviteMember = Command.make("invite", {
  email: Argument.String("email").pipe(Argument.withSchema(Email)),
  role: Flag.String("role").pipe(Flag.withSchema(RoleSlug), Flag.withDescription("Role slug"), Flag.withDefault(RoleSlug.make("member")))
}, ({ email, role }) =>
  Effect.gen(function*() {
    const member = yield* (yield* api).members.invite({ payload: { email, role } })
    yield* emit(Member, member, (m) => `Invited ${m.email} as ${m.role} (${m.id}).`)
  })).pipe(Command.withDescription("Invite someone by email"))

const offboardMember = Command.make("offboard", {
  member: Argument.String("member").pipe(Argument.withDescription("Email or membership id")),
  yes: yesFlag
}, ({ member, yes }) =>
  Effect.gen(function*() {
    const client = yield* api
    const id = Schema.is(MembershipId)(member) ? member : (yield* findMember(client)(member)).id
    yield* confirm(`Offboard ${member}? This ends the membership, revokes their tokens and direct grants, and removes them from teams.`, yes)
    const removed = yield* client.members.remove({ params: { id } })
    yield* emit(Member, removed, (m) => `Offboarded ${m.email} (${m.id}).`)
  })).pipe(Command.withDescription("Offboard a member: one step, everything revoked"))

export const members = Command.make("members").pipe(
  Command.withDescription("People in the org"),
  Command.withSubcommands([listMembers, inviteMember, offboardMember])
)

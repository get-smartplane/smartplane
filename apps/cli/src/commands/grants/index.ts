import { Action, Grant, GrantId } from "@pc/domain"
import { DateTime, Effect, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { lookupNames } from "../../api/names"
import { field } from "../../app/common-flags"
import { usageFailure } from "../../app/failure"
import { CommaList, parseMoment } from "../../app/flag-values"
import { emit, emitWith } from "../../app/output"
import { resolveResource } from "../../resolve/entities"
import { resolveSubject, subjectHelp, subjectId } from "../../resolve/subject"
import { Removed } from "../resources/remove"
import { grantRefs, grantTable } from "./describe"

const resource = Flag.String("resource").pipe(Flag.withAlias("r"), Flag.withDescription("Resource name or id"))
const to = Flag.String("to").pipe(Flag.withDescription(subjectHelp))

const listGrants = Command.make("ls", { resource: resource.pipe(Flag.optional), to: to.pipe(Flag.optional) }, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const resourceId = yield* Effect.transposeOption(Option.map(flags.resource, resolveResource(client)))
    const subject = yield* Effect.transposeOption(Option.map(flags.to, (spec) => resolveSubject(client, spec)))
    const grants = yield* client.grants.list({
      query: { ...field("resourceId", resourceId), ...field("subjectId", Option.map(subject, subjectId)) }
    })
    yield* emitWith(Schema.Array(Grant), grants, (rows) => Effect.map(lookupNames(client, grantRefs(rows)), (names) => grantTable(rows, names)))
  })).pipe(Command.withDescription("List active grants"), Command.withAlias("list"))

const addGrant = Command.make("add", {
  to,
  resource,
  level: Flag.Literals("level", Action.literals).pipe(Flag.withDescription("read < use < write < admin; each implies the ones before")),
  tools: Flag.String("tools").pipe(Flag.withSchema(CommaList(Schema.NonEmptyString)), Flag.withDescription("Only these tools or actions"), Flag.optional),
  expires: Flag.String("expires").pipe(Flag.withDescription("30d, 12h, 2w, or a date such as 2026-12-31"), Flag.optional)
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const now = yield* DateTime.now
    const expiresAt = yield* Effect.transposeOption(Option.map(flags.expires, (text) =>
      Option.match(parseMoment(text, now), {
        onNone: () => Effect.fail(usageFailure(`Cannot read --expires "${text}".`, "Use 30d, 12h, 2w or 2026-12-31.")),
        onSome: Effect.succeed
      })))
    const grant = yield* client.grants.create({
      payload: {
        subject: yield* resolveSubject(client, flags.to),
        resourceId: yield* resolveResource(client)(flags.resource),
        action: flags.level,
        conditions: field("tools", flags.tools),
        expiresAt: Option.getOrNull(expiresAt)
      }
    })
    yield* emitWith(Grant, grant, (row) => Effect.map(lookupNames(client, grantRefs([row])), (names) => grantTable([row], names)))
  })).pipe(
    Command.withDescription("Grant a team, user, role or service account access to a resource"),
    Command.withExamples([
      { command: "smartplane grants add --to team:platform --resource github --level use --tools create_issue,list_issues --expires 30d", description: "Time-boxed, tool-limited access" }
    ])
  )

const revokeGrant = Command.make("revoke", { id: Argument.String("id").pipe(Argument.withSchema(GrantId)) }, ({ id }) =>
  Effect.gen(function*() {
    yield* (yield* api).grants.revoke({ params: { id } })
    yield* emit(Removed, { id, removed: true }, () => `Revoked ${id}.`)
  })).pipe(Command.withDescription("Revoke a grant (it stays in the audit log)"))

export const grants = Command.make("grants").pipe(
  Command.withDescription("Who may use which resource, at what level"),
  Command.withSubcommands([listGrants, addGrant, revokeGrant])
)

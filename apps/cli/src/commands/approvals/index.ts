import { type Actor, Approval, ApprovalId, type LookupRef } from "@pc/domain"
import { Effect, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { lookupNames, type Names } from "../../api/names"
import { field } from "../../app/common-flags"
import { formatTime } from "../../app/format"
import { emit, emitWith } from "../../app/output"
import { tableOr } from "../../app/table"

const actorRef = (actor: Actor): ReadonlyArray<LookupRef> =>
  actor.type === "user" ? [{ kind: "user", id: actor.id }] : actor.type === "service_account" ? [{ kind: "token", id: actor.id }] : []

const actorLabel = (actor: Actor, names: Names) =>
  actor.type === "user" ? names.of("user", actor.id) : actor.type === "service_account" ? names.of("token", actor.id) : `system:${actor.id}`

const approvalTable = (approvals: ReadonlyArray<Approval>, names: Names) =>
  tableOr(
    "Nothing is waiting for approval.",
    ["id", "tool", "resource", "requested by", "rule", "expires", "arguments"],
    approvals.map((a) => [
      a.id,
      a.request.tool,
      names.of("resource", a.request.resourceId),
      actorLabel(a.requestedBy, names),
      names.of("guard", a.guardId),
      formatTime(a.expiresAt),
      JSON.stringify(a.request.arguments)
    ])
  )

const refs = (approvals: ReadonlyArray<Approval>): ReadonlyArray<LookupRef> =>
  approvals.flatMap((a) => [{ kind: "resource", id: a.request.resourceId }, { kind: "guard", id: a.guardId }, ...actorRef(a.requestedBy)])

const listApprovals = Command.make("ls", {}, () =>
  Effect.gen(function*() {
    const client = yield* api
    const pending = yield* client.approvals.listPending()
    yield* emitWith(Schema.Array(Approval), pending, (rows) => Effect.map(lookupNames(client, refs(rows)), (names) => approvalTable(rows, names)))
  })).pipe(Command.withDescription("List agent actions waiting for a human decision"), Command.withAlias("list"))

const decide = (name: "approve" | "reject", decision: "approved" | "rejected") =>
  Command.make(name, {
    id: Argument.String("id").pipe(Argument.withSchema(ApprovalId)),
    comment: Flag.String("comment").pipe(Flag.withAlias("m"), Flag.withDescription("Reason, kept in the audit log"), Flag.optional)
  }, ({ comment, id }) =>
    Effect.gen(function*() {
      const approval = yield* (yield* api).approvals.decide({ params: { id }, payload: { decision, ...field("comment", comment) } })
      yield* emit(Approval, approval, (a) => `${a.id} ${a.status}: ${a.request.tool}`)
    })).pipe(Command.withDescription(`${name === "approve" ? "Approve" : "Reject"} a pending request (not your own)`))

export const approvals = Command.make("approvals").pipe(
  Command.withDescription("Decide agent actions held by approval rules"),
  Command.withSubcommands([listApprovals, decide("approve", "approved"), decide("reject", "rejected")])
)

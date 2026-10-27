import { type AuditEventType, AuditEventType as EventType, ChainedAuditEvent } from "@pc/domain"
import { Duration, Effect, Option, Ref } from "effect"
import { Command, Flag } from "effect/cli"
import { type Api, api } from "../../api/client"
import { lookupNames } from "../../api/names"
import { field } from "../../app/common-flags"
import { out, toJson } from "../../app/output"
import { JsonOutput } from "../../app/settings"
import { eventLine, eventRefs } from "./describe"

/** Forward pages hold at most this many events; a busier interval is drained page by page. */
const pageSize = 500

/**
 * Prints every event after `cursor`, oldest first, and returns the newest seq seen. Without a cursor (nothing
 * logged yet) it reads the latest page instead, which then anchors the forward pages.
 */
const catchUp = <R>(client: Api, type: Option.Option<AuditEventType>, print: (events: ReadonlyArray<ChainedAuditEvent>) => Effect.Effect<void, never, R>) =>
  Effect.fn("AuditTail.catchUp")(function*(cursor: Option.Option<number>) {
    let next = cursor
    while (true) {
      const page = yield* client.audit.list({
        query: { limit: pageSize, ...field("after", next), ...field("type", type) }
      })
      yield* print([...page.events].reverse())
      next = Option.orElse(Option.fromNullishOr(page.prevCursor), () => next)
      if (Option.isNone(cursor) || page.events.length < pageSize) return next
    }
  })

export const tailAudit = Command.make("tail", {
  follow: Flag.Boolean("follow").pipe(Flag.withAlias("f"), Flag.withDescription("Keep polling for new events"), Flag.withDefault(false)),
  type: Flag.Literals("type", EventType.literals).pipe(Flag.withDescription("Only this event type, e.g. policy.denied"), Flag.optional),
  lines: Flag.Int("lines").pipe(Flag.withAlias("n"), Flag.withDescription("How many recent events to show first (max 500)"), Flag.withDefault(20)),
  interval: Flag.Int("interval").pipe(Flag.withDescription("Seconds between polls with --follow"), Flag.withDefault(2))
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const json = yield* JsonOutput
    // NDJSON under --json: one event per line, so a growing stream can be piped into jq.
    const print = (events: ReadonlyArray<ChainedAuditEvent>) =>
      json
        ? Effect.forEach(events, (event) => Effect.flatMap(toJson(ChainedAuditEvent, event), (encoded) => out(JSON.stringify(encoded))), { discard: true })
        : Effect.flatMap(lookupNames(client, eventRefs(events)), (names) => Effect.forEach(events, (event) => out(eventLine(event, names)), { discard: true }))
    const recent = yield* client.audit.list({ query: { limit: Math.min(Math.max(flags.lines, 1), pageSize), ...field("type", flags.type) } })
    yield* print([...recent.events].reverse())
    if (!flags.follow) return
    const cursor = yield* Ref.make(Option.fromNullishOr(recent.prevCursor))
    const poll = catchUp(client, flags.type, print)
    yield* Ref.get(cursor).pipe(
      Effect.flatMap(poll),
      Effect.flatMap((next) => Ref.set(cursor, next)),
      Effect.delay(Duration.seconds(Math.max(flags.interval, 1))),
      Effect.forever
    )
  })).pipe(
    Command.withDescription("Show recent audit events; --follow keeps polling with the `after` cursor"),
    Command.withExamples([{ command: "smartplane audit tail -f --type policy.denied --json | jq .", description: "Stream denials as NDJSON" }])
  )

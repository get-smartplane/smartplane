import type { ChainedAuditEvent, LookupRef } from "@pc/domain"
import type { Names } from "../../api/names"
import { formatTime } from "../../app/format"

/** Actors and targets of a batch, for one name lookup. */
export const eventRefs = (events: ReadonlyArray<ChainedAuditEvent>): ReadonlyArray<LookupRef> =>
  events.flatMap((event) => [
    ...(event.actor.type === "user" ? [{ kind: "user" as const, id: event.actor.id }] : []),
    ...(event.actor.type === "service_account" ? [{ kind: "token" as const, id: event.actor.id }] : []),
    ...(event.target === null ? [] : [{ kind: event.target.type, id: event.target.id }])
  ])

const actorLabel = (event: ChainedAuditEvent, names: Names) => {
  switch (event.actor.type) {
    case "user":
      return names.of("user", event.actor.id)
    case "service_account":
      return `token:${names.of("token", event.actor.id)}`
    case "system":
      return `system:${event.actor.id}`
  }
}

/** One event per line, oldest first, like `tail`: `seq  time  type  actor -> target`. */
export const eventLine = (event: ChainedAuditEvent, names: Names): string =>
  [
    String(event.seq).padStart(6),
    formatTime(event.occurredAt),
    event.type.padEnd(24),
    actorLabel(event, names),
    ...(event.target === null ? [] : ["->", `${event.target.type}:${names.of(event.target.type, event.target.id)}`])
  ].join("  ")

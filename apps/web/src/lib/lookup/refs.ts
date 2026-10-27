import type { Actor, GrantSubject, LookupRef } from "@pc/domain"

const machinePrefix = "machine_token:"

/** A machine token acting is recorded as the system actor `machine_token:<id>`; its `mtk_` id, else undefined. */
export const machineTokenIdOf = (actor: Actor): string | undefined =>
  actor.type === "system" && actor.id.startsWith(machinePrefix) ? actor.id.slice(machinePrefix.length) : undefined

/** Other system actors (`scim`, `cron`) name a subsystem, not an entity, so they have no ref. */
export const actorRef = (actor: Actor): LookupRef | null => {
  switch (actor.type) {
    case "user":
      return { kind: "user", id: actor.id }
    case "service_account":
      return { kind: "token", id: actor.id }
    case "system": {
      // The lookup resolves `mtk_` ids under the token kind.
      const machine = machineTokenIdOf(actor)
      return machine === undefined ? null : { kind: "token", id: machine }
    }
  }
}

export const subjectRef = (subject: GrantSubject): LookupRef => {
  switch (subject.type) {
    case "user":
      return { kind: "user", id: subject.id }
    case "team":
      return { kind: "team", id: subject.id }
    case "role":
      return { kind: "role", id: subject.role }
    case "service_account":
      return { kind: "token", id: subject.id }
  }
}

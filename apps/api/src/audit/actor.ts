import type { Actor, Principal } from "@pc/domain"

export const actorOf = (principal: Principal): Actor =>
  principal._tag === "User"
    ? { type: "user", id: principal.userId }
    : { type: "service_account", id: principal.tokenId }

export const systemActor = (subsystem: string): Actor => ({ type: "system", id: subsystem })

/**
 * A machine token acting. Recorded as a system actor (`machine_token:<id>`) so existing audit readers keep
 * working; the token id is also in the event's data as `machineTokenId`.
 */
export const machineActor = (id: string): Actor => ({ type: "system", id: `machine_token:${id}` })

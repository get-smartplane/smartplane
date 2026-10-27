import type { ConnectionContext, Guard, Principal } from "@pc/domain"
import { namesAccount } from "./references"

/** What the guards judging a call need to know about who is calling and through which account. */
export interface IdentityNeeds {
  /** A guard names specific people: the caller's email (or a service account's name) and who connected the account. */
  readonly people: boolean
  /** Account identities the guards name ("billing@"); `all` for guards verified before references were read. */
  readonly accounts: ReadonlyArray<string> | "all"
}

/** Rules verified before `references` existed keep what they were written against: every identity. */
export const identityNeeds = (guards: ReadonlyArray<Guard>): IdentityNeeds => {
  const legacy = guards.some((guard) => guard.compiled?.references === undefined)
  const people = legacy || guards.some((guard) => guard.compiled?.references?.people === true || guard.applies?.actors?.refs.some((ref) => ref._tag === "User") === true)
  return { people, accounts: legacy ? "all" : [...new Set(guards.flatMap((guard) => guard.compiled?.references?.accounts ?? []))] }
}

/**
 * The caller as the classifier sees it. Role and team names always (rules name them); the email only when a
 * guard names people. One caller per call, so no stand-in label is needed to keep the state coherent.
 */
export const actorState = (principal: Principal, teamNames: ReadonlyArray<string>, needs: IdentityNeeds) => ({
  type: principal._tag,
  ...(needs.people ? (principal._tag === "User" ? { email: principal.email } : { name: principal.name }) : {}),
  role: principal.role,
  teams: principal.teamIds,
  teamNames,
  project: principal.projectId
})

/**
 * The account a call goes through, as the classifier sees it: always its mode (shared or the caller's own);
 * the provider's identity of it only when a guard names that account; who connected it only when guards name people.
 */
export const connectionState = (connection: ConnectionContext | null, needs: IdentityNeeds) => {
  if (connection === null) return null
  const identity = connection.accountIdentity
  const named = identity !== null && (needs.accounts === "all" || namesAccount(needs.accounts, identity.email, identity.username))
  return {
    mode: connection.mode,
    ...(named ? { accountIdentity: identity } : {}),
    ...(needs.people && connection.connectedBy !== null ? { connectedBy: connection.connectedBy } : {})
  }
}

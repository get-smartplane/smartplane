import type { AddedCatalogServer } from "@pc/domain"
import type { Tone } from "@/components/status/tone"

export interface ServerState {
  readonly label: string
  readonly tone: Tone
  /** One line under the name; null when the badge says it all. */
  readonly detail: string | null
  /** The shared account still needs a sign-in (first time, or again). */
  readonly needsSignIn: boolean
}

/** The org's copy most in need of attention first: a broken sign-in, then an unfinished one. */
export const primaryOf = (added: ReadonlyArray<AddedCatalogServer>): AddedCatalogServer | undefined => {
  const rank = { needs_reauth: 0, not_connected: 1, connected: 2, per_user: 3 } as const
  return [...added].sort((a, b) => rank[a.status] - rank[b.status])[0]
}

export const serverState = (server: AddedCatalogServer): ServerState => {
  switch (server.status) {
    case "connected":
      return { label: "Connected", tone: "success", detail: server.connectedBy === null ? null : `by ${server.connectedBy}`, needsSignIn: false }
    case "needs_reauth":
      return { label: "Sign in again", tone: "danger", detail: "Sign-in expired", needsSignIn: true }
    case "not_connected":
      return { label: "Waiting for sign-in", tone: "warning", detail: null, needsSignIn: true }
    case "per_user":
      return { label: "Per person", tone: "info", detail: "Members sign in", needsSignIn: false }
  }
}

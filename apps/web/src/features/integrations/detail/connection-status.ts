import type { AccountMode, IntegrationConnection } from "@pc/domain"
import type { Tone } from "@/components/status/tone"

export interface ConnectionStatus {
  readonly label: string
  readonly tone: Tone
  /** What to do about it, when anything. */
  readonly hint: string | null
}

/** Each member connects their own account; the "Connection" panel shows the caller's. */
const perUser: ConnectionStatus = { label: "Per-user accounts", tone: "info", hint: null }

/** Credential connections work as soon as they are saved; OAuth2 ones only once someone has signed in. */
export const connectionStatus = (connection: IntegrationConnection, accountMode?: AccountMode): ConnectionStatus => {
  if (accountMode === "per_user") return perUser
  if (connection.type !== "oauth2") return { label: "Connected", tone: "success", hint: null }
  switch (connection.status) {
    case "connected":
      return { label: "Connected", tone: "success", hint: null }
    case "needs_reauth":
      return { label: "Needs sign-in again", tone: "danger", hint: "The provider stopped accepting the stored sign-in. Agents cannot use it until someone reconnects." }
    case "not_connected":
      return { label: "Not connected", tone: "warning", hint: "Nobody has signed in yet, so agents see none of its actions." }
  }
}

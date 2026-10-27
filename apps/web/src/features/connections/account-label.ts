import type { AccountIdentity, Connection } from "@pc/domain"
import type { Tone } from "@/components/status/tone"

/** The provider's name for the account: email, else username, else display name; null when it said nothing. */
export const accountLabel = (identity: AccountIdentity | null): string | null =>
  identity === null ? null : identity.email ?? identity.username ?? identity.name ?? null

export const connectionTone = (connection: Connection | null): { readonly label: string; readonly tone: Tone } =>
  connection === null
    ? { label: "Not connected", tone: "warning" }
    : connection.status === "connected"
    ? { label: "Connected", tone: "success" }
    : { label: "Needs sign-in again", tone: "danger" }

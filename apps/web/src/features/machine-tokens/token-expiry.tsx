import type { MachineToken } from "@pc/domain"
import { StatusText } from "@/components/status/status-badge"
import { formatDate, formatRelative, isPast } from "@/lib/format"
import { expiresSoon } from "./expiry"

/** The expiry date, with the state that matters: revoked, expired, or due for renewal soon. */
export function TokenExpiry({ token }: { readonly token: MachineToken }) {
  if (token.revokedAt !== null) {
    return (
      <span className="flex flex-col leading-tight">
        <StatusText tone="danger">Revoked</StatusText>
        <span className="pl-4 text-xs text-muted-foreground tabular-nums">{formatDate(token.revokedAt)}</span>
      </span>
    )
  }
  if (isPast(token.expiresAt)) return <StatusText tone="neutral">Expired {formatDate(token.expiresAt)}</StatusText>
  const date = <span className="tabular-nums">{formatDate(token.expiresAt)}</span>
  if (!expiresSoon(token)) return <span className="flex flex-col leading-tight">{date}<span className="text-xs text-muted-foreground">{formatRelative(token.expiresAt)}</span></span>
  return (
    <span className="flex flex-col leading-tight">
      <StatusText tone="warning">{formatRelative(token.expiresAt)}</StatusText>
      <span className="pl-4 text-xs text-muted-foreground tabular-nums">{formatDate(token.expiresAt)}</span>
    </span>
  )
}

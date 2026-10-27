import type { AccessToken } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"
import { isPast } from "@/lib/format"

export const isTokenLive = (token: AccessToken) => token.revokedAt === null && !isPast(token.expiresAt)

export function TokenStatus({ token }: { readonly token: AccessToken }) {
  if (token.revokedAt !== null) return <StatusBadge tone="danger">Revoked</StatusBadge>
  if (isPast(token.expiresAt)) return <StatusBadge tone="neutral">Expired</StatusBadge>
  return <StatusBadge tone="success">Active</StatusBadge>
}

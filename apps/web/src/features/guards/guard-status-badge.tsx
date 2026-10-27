import type { GuardStatus } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"
import { statusMeta } from "./guard-meta"

export function GuardStatusBadge({ status }: { readonly status: GuardStatus }) {
  const { label, tone } = statusMeta[status]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

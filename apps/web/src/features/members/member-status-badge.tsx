import type { MemberStatus } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"
import type { Tone } from "@/components/status/tone"

const statusTone: { readonly [S in MemberStatus]: Tone } = { active: "success", invited: "warning", deprovisioned: "danger" }
const statusLabel: { readonly [S in MemberStatus]: string } = { active: "Active", invited: "Invited", deprovisioned: "Offboarded" }

export function MemberStatusBadge({ status }: { readonly status: MemberStatus }) {
  return <StatusBadge tone={statusTone[status]}>{statusLabel[status]}</StatusBadge>
}

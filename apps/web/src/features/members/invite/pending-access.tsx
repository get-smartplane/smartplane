import type { Member, PendingInvite } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { teamsAtom } from "@/features/teams/atoms"
import { pendingInvitesAtom } from "../atoms"
import { EditInviteAccessDialog } from "./edit-invite-access-dialog"

/** Only rendered for people who manage members: planned access is access-control data. */
const usePendingInvite = (member: Member): PendingInvite | undefined =>
  useQueryData(pendingInvitesAtom, []).find((invite) => invite.membershipId === member.id)

/** What a pending invitation carries, in a few words under the address. */
export function PendingAccessLine({ member }: { readonly member: Member }) {
  const invite = usePendingInvite(member)
  const teams = useQueryData(teamsAtom, [])
  if (invite === undefined) return <span className="text-xs text-muted-foreground">No access set up yet</span>
  const names = teams.filter((team) => invite.access.teamIds.includes(team.id)).map((team) => team.name)
  const grants = invite.access.grants.length
  const parts = [
    names.length > 0 ? `joins ${names.join(", ")}` : null,
    grants > 0 ? `${grants} direct ${grants === 1 ? "grant" : "grants"}` : null
  ].filter((part) => part !== null)
  return <span className="text-xs text-muted-foreground">On accepting: {parts.join(" · ")}</span>
}

/** Opens the access setup of a pending invitation made here (directory invitations are managed there). */
export function PendingAccessAction({ member }: { readonly member: Member }) {
  const invite = usePendingInvite(member)
  return <EditInviteAccessDialog member={member} invite={invite} />
}

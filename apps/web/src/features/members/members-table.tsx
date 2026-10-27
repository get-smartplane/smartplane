import type { Member, MemberSource } from "@pc/domain"
import { Initials } from "@/components/status/initials"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCan, useMe } from "@/features/auth/me-context"
import { formatRelative } from "@/lib/format"
import { PendingAccessAction, PendingAccessLine } from "./invite/pending-access"
import { MemberRoleCell } from "./member-role-cell"
import { MemberStatusBadge } from "./member-status-badge"
import { RemoveMemberDialog } from "./remove-member-dialog"
import { TableFrame } from "@/components/layout/table-frame"

/** Why a member cannot be offboarded from this row, in words; undefined when they can. */
const offboardBlocked = (member: Member, self: string | null): string | undefined =>
  member.id === self
    ? "You cannot offboard yourself"
    : member.status === "deprovisioned"
      ? "Already offboarded"
      : member.source === "scim"
        ? "Managed by directory sync: remove them in your identity provider"
        : undefined

const sourceLabel: { readonly [S in MemberSource]: string } = { workos: "WorkOS", scim: "Directory sync", manual: "Invitation" }

export function MembersTable({ members }: { readonly members: ReadonlyArray<Member> }) {
  const { principal } = useMe()
  const canManage = useCan("members:manage")
  const self = principal._tag === "User" ? principal.membershipId : null
  // Invitations made here carry an access setup that can change until they are accepted.
  const pending = (member: Member) => canManage && member.status === "invited" && member.source === "manual"

  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="hidden md:table-cell">Source</TableHead>
            <TableHead className="hidden md:table-cell">Last seen</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const editable = canManage && member.status !== "deprovisioned" && member.source !== "scim"
            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <Initials name={member.name ?? member.email} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{member.name ?? member.email}</span>
                      {member.name && <span className="truncate text-xs text-muted-foreground">{member.email}</span>}
                      {pending(member) && <PendingAccessLine member={member} />}
                      {member.status !== "active" && (
                        <span className="pt-1 sm:hidden">
                          <MemberStatusBadge status={member.status} />
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <MemberRoleCell member={member} editable={editable && member.id !== self} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <MemberStatusBadge status={member.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{sourceLabel[member.source]}</TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                  {member.lastSeenAt ? formatRelative(member.lastSeenAt) : "Never"}
                </TableCell>
                <TableCell>
                  {canManage && (
                    <span className="flex justify-end gap-0.5">
                      {pending(member) && <PendingAccessAction member={member} />}
                      <RemoveMemberDialog member={member} blocked={offboardBlocked(member, self)} />
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

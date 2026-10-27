import type { Team, TeamMember } from "@pc/domain"
import { UserMinus } from "lucide-react"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { RowAction } from "@/components/form/row-action"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMutation } from "@/lib/api/use-mutation"
import { formatDate } from "@/lib/format"
import { removeTeamMemberAtom } from "./atoms"
import { TableFrame } from "@/components/layout/table-frame"

interface TeamMembersTableProps {
  readonly team: Team
  readonly members: ReadonlyArray<TeamMember>
  readonly editable: boolean
}

export function TeamMembersTable({ team, members, editable }: TeamMembersTableProps) {
  const remove = useMutation(removeTeamMemberAtom, { success: "Removed from team" })
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead className="hidden sm:table-cell">Added</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.userId}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{member.name ?? member.email}</span>
                  {member.name && <span className="text-xs text-muted-foreground">{member.email}</span>}
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(member.addedAt)}</TableCell>
              <TableCell>
                {editable && (
                  <ConfirmDialog
                    trigger={
                      <RowAction label={`Remove ${member.email}`} danger>
                        <UserMinus />
                      </RowAction>
                    }
                    title={`Remove ${member.email} from ${team.name}?`}
                    description={<p>They lose any access granted to this team. Their org membership is unchanged.</p>}
                    confirmLabel="Remove"
                    destructive
                    onConfirm={async () =>
                      (await remove.execute({ id: team.id, userId: member.userId }))._tag === "Success"
                    }
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

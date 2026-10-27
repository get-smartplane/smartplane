import type { Team } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCan } from "@/features/auth/me-context"
import { formatDate } from "@/lib/format"
import { DirectoryBadge } from "./directory-badge"
import { RemoveTeamDialog } from "./remove-team-dialog"
import { TableFrame } from "@/components/layout/table-frame"

export function TeamsTable({ teams }: { readonly teams: ReadonlyArray<Team> }) {
  const canManage = useCan("teams:manage")
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="hidden md:table-cell">Created</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TableRow key={team.id}>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/teams/$teamId" params={{ teamId: team.id }} className="font-semibold underline-offset-4 hover:underline">
                    {team.name}
                  </Link>
                  {team.directoryGroupId !== null && <DirectoryBadge />}
                </div>
                <span className="font-mono text-xs text-muted-foreground">{team.slug}</span>
              </TableCell>
              <TableCell className="tabular-nums">{team.memberCount}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(team.createdAt)}</TableCell>
              <TableCell>{canManage && <RemoveTeamDialog team={team} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

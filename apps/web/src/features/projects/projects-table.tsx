import type { Project } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCan } from "@/features/auth/me-context"
import { formatDate } from "@/lib/format"
import { ArchiveProjectButton } from "./archive-project-button"
import { TableFrame } from "@/components/layout/table-frame"

export function ProjectsTable({ projects }: { readonly projects: ReadonlyArray<Project> }) {
  const canManage = useCan("projects:manage")
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Created</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-semibold">{project.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{project.slug}</span>
                </div>
              </TableCell>
              <TableCell>
                {project.archivedAt === null ? (
                  <StatusBadge tone="success">Active</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Archived</StatusBadge>
                )}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(project.createdAt)}</TableCell>
              <TableCell>{canManage && <ArchiveProjectButton project={project} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

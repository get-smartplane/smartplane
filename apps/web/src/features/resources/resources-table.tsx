import type { Resource } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { useQueryData } from "@/components/query/use-query-data"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCan } from "@/features/auth/me-context"
import { projectsAtom } from "@/features/projects/atoms"
import { kindMeta } from "./kinds"
import { RemoveResourceDialog } from "./remove-resource-dialog"
import { ResourceConfigSummary } from "./resource-config-summary"
import { RotateSecretDialog } from "./rotate-secret-dialog"
import { TableFrame } from "@/components/layout/table-frame"

export function ResourcesTable({ resources }: { readonly resources: ReadonlyArray<Resource> }) {
  const canManage = useCan("resources:manage")
  const projects = useQueryData(projectsAtom(true), [])
  const projectName = (id: string | null) => (id === null ? "Org-wide" : (projects.find((p) => p.id === id)?.name ?? id))

  return (
    <TableFrame>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[55%]">Resource</TableHead>
            <TableHead className="hidden w-32 sm:table-cell">Kind</TableHead>
            <TableHead className="hidden w-36 lg:table-cell">Visible in</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.map((resource) => {
            const { label, icon: Icon } = kindMeta[resource.config.kind]
            return (
              <TableRow key={resource.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link to="/resources/$resourceId" params={{ resourceId: resource.id }} className="truncate font-semibold hover:underline">
                        {resource.name}
                      </Link>
                      <ResourceConfigSummary config={resource.config} resourceId={resource.id} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{label}</TableCell>
                <TableCell className="hidden truncate text-muted-foreground lg:table-cell">
                  {projectName(resource.projectId)}
                </TableCell>
                <TableCell>
                  {canManage && (
                    <div className="flex justify-end gap-1">
                      {resource.config.kind === "secret" && <RotateSecretDialog resource={resource} />}
                      <RemoveResourceDialog resource={resource} />
                    </div>
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

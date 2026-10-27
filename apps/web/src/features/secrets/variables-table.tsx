import type { Resource } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { Braces } from "lucide-react"
import { TableFrame } from "@/components/layout/table-frame"
import { EntityName } from "@/components/status/entity-name"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RemoveResourceDialog } from "@/features/resources/remove-resource-dialog"
import { formatDate } from "@/lib/format"
import { EnvNameEditor } from "./delivery/env-name-editor"

/**
 * Variables are plain configuration, so their values show; agents read them with `variables_get` once granted,
 * and they are always deliverable, so each shows the env name `smartplane run` and machine tokens use.
 */
export function VariablesTable({ variables, canManage }: { readonly variables: ReadonlyArray<Resource>; readonly canManage: boolean }) {
  return (
    <TableFrame>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[58%] sm:w-[40%] md:w-[28%]">Variable</TableHead>
            <TableHead className="hidden w-[30%] md:table-cell">Env name</TableHead>
            <TableHead>Value</TableHead>
            <TableHead className="hidden w-36 lg:table-cell">Visible in</TableHead>
            <TableHead className="hidden w-32 sm:table-cell">Created</TableHead>
            {canManage && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {variables.map((variable) => (
            <TableRow key={variable.id}>
              <TableCell>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Braces className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link to="/resources/$resourceId" params={{ resourceId: variable.id }} className="truncate font-semibold hover:underline">
                      {variable.name}
                    </Link>
                    {variable.description && <span className="truncate text-xs text-muted-foreground">{variable.description}</span>}
                    <span className="flex min-w-0 md:hidden">
                      <EnvNameEditor resource={variable} canEdit={canManage} compact />
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <EnvNameEditor resource={variable} canEdit={canManage} />
              </TableCell>
              <TableCell>
                <code className="block truncate font-mono text-xs" title={variable.config.kind === "variable" ? variable.config.value : undefined}>
                  {variable.config.kind === "variable" ? variable.config.value : ""}
                </code>
              </TableCell>
              <TableCell className="hidden truncate text-muted-foreground lg:table-cell">
                {variable.projectId === null ? "Org-wide" : <EntityName entity={{ kind: "project", id: variable.projectId }} />}
              </TableCell>
              <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">{formatDate(variable.createdAt)}</TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex justify-end">
                    <RemoveResourceDialog resource={variable} />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

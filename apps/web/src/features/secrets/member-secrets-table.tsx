import { envNameOf, type Resource, type ResourceId, type SecretStatus } from "@pc/domain"
import { KeyRound, Terminal } from "lucide-react"
import { TableFrame } from "@/components/layout/table-frame"
import { EntityName } from "@/components/status/entity-name"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format"

interface MemberSecretsTableProps {
  readonly secrets: ReadonlyArray<Resource>
  readonly statuses: ReadonlyMap<ResourceId, SecretStatus>
}

/**
 * Deliverable secrets a member holds a `use` grant on: metadata only (the API never returns a value here),
 * with the env name `smartplane run` sets. Gateway-only secrets never reach this list.
 */
export function MemberSecretsTable({ secrets, statuses }: MemberSecretsTableProps) {
  return (
    <TableFrame>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[55%] sm:w-[40%]">Secret</TableHead>
            <TableHead>Env name</TableHead>
            <TableHead className="hidden w-36 md:table-cell">Visible in</TableHead>
            <TableHead className="hidden w-32 sm:table-cell">Last rotated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {secrets.map((secret) => {
            const status = statuses.get(secret.id)
            return (
              <TableRow key={secret.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <KeyRound className="size-4" strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-semibold">{secret.name}</span>
                      <span className="inline-flex min-w-0 items-start gap-1 text-xs whitespace-normal text-muted-foreground">
                        <Terminal className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        <span>
                          Available to <code className="font-mono whitespace-nowrap text-foreground">smartplane run</code>
                        </span>
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <code className="inline-block max-w-full truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs">{envNameOf(secret)}</code>
                </TableCell>
                <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                  {secret.projectId === null ? "Org-wide" : <EntityName entity={{ kind: "project", id: secret.projectId }} />}
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                  {status === undefined || status.version === 1 ? "Never" : formatDate(status.versionCreatedAt)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

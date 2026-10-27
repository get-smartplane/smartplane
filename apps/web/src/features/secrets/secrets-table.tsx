import type { Resource, ResourceId, SecretStatus } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { KeyRound } from "lucide-react"
import { TableFrame } from "@/components/layout/table-frame"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RemoveResourceDialog } from "@/features/resources/remove-resource-dialog"
import { RotateSecretDialog } from "@/features/resources/rotate-secret-dialog"
import { formatDate } from "@/lib/format"
import { DeliveryControl } from "./delivery/delivery-control"
import { UsedByList } from "./used-by-list"

interface SecretsTableProps {
  readonly secrets: ReadonlyArray<Resource>
  readonly statuses: ReadonlyMap<ResourceId, SecretStatus>
  readonly users: ReadonlyMap<ResourceId, ReadonlyArray<Resource>>
}

/**
 * Version 1 was written at creation; anything later is a rotation. Token secrets Smartplane manages for an
 * OAuth2 integration gain a version on every refresh, so for them it reads as one.
 */
function LastRotated({ status, managed }: { readonly status: SecretStatus | undefined; readonly managed: boolean }) {
  if (status === undefined || status.version === 1) return <span className="text-muted-foreground">Never</span>
  return (
    <span className="flex flex-col leading-tight" title={`Version ${status.version}`}>
      <span className="tabular-nums">{formatDate(status.versionCreatedAt)}</span>
      {managed && <span className="text-xs text-muted-foreground">Refreshed by Smartplane</span>}
    </span>
  )
}

const managedTokenOf = (resource: Resource) =>
  resource.config.kind === "integration" && resource.config.connection.type === "oauth2" ? resource.config.connection.tokenSecretId : undefined

const removalWarning = (secret: Resource, users: ReadonlyArray<Resource>) =>
  users.length === 0 ? (
    <p>Nothing uses {secret.name}. Its encrypted versions stay for the audit history.</p>
  ) : (
    <p>
      {users.map((user) => user.name).join(", ")} {users.length === 1 ? "uses" : "use"} this secret and will fail to authenticate until given another.
    </p>
  )

/** Names, where each secret is used and how fresh it is; values never leave the server. */
export function SecretsTable({ secrets, statuses, users }: SecretsTableProps) {
  return (
    <TableFrame>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="sm:w-[40%] lg:w-[25%]">Secret</TableHead>
            <TableHead className="hidden sm:table-cell">Delivery</TableHead>
            <TableHead className="hidden w-[22%] lg:table-cell">Used by</TableHead>
            <TableHead className="hidden w-40 md:table-cell">Last rotated</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {secrets.map((secret) => {
            const usedBy = users.get(secret.id) ?? []
            return (
              <TableRow key={secret.id} className="align-top">
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <KeyRound className="size-4" strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link to="/resources/$resourceId" params={{ resourceId: secret.id }} className="truncate font-semibold hover:underline">
                        {secret.name}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground lg:hidden">
                        {usedBy.length === 0 ? "Not used" : `Used by ${usedBy.map((user) => user.name).join(", ")}`}
                      </span>
                      {secret.description && <span className="hidden truncate text-xs text-muted-foreground lg:block">{secret.description}</span>}
                    </div>
                  </div>
                  {/* Phones have no room for a Delivery column, so the control sits under the name. */}
                  <div className="mt-3 whitespace-normal sm:hidden">
                    <DeliveryControl secret={secret} idSuffix="narrow" />
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-normal sm:table-cell">
                  <DeliveryControl secret={secret} idSuffix="wide" />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <UsedByList users={usedBy} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <LastRotated status={statuses.get(secret.id)} managed={usedBy.some((user) => managedTokenOf(user) === secret.id)} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <RotateSecretDialog resource={secret} />
                    <RemoveResourceDialog resource={secret} consequence={removalWarning(secret, usedBy)} />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

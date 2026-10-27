import type { MachineToken } from "@pc/domain"
import { TableFrame } from "@/components/layout/table-frame"
import { EntityName } from "@/components/status/entity-name"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AllowList } from "./allow-list"
import { RenewMachineTokenButton } from "./renew-machine-token-button"
import { RevokeMachineTokenButton } from "./revoke-machine-token-button"
import { TokenExpiry } from "./token-expiry"

function LastUsed({ token }: { readonly token: MachineToken }) {
  if (token.lastUsedAt === null) return <span className="text-muted-foreground">Never</span>
  return (
    <span className="flex flex-col leading-tight" title={formatDateTime(token.lastUsedAt)}>
      <span className="tabular-nums">{formatRelative(token.lastUsedAt)}</span>
      {token.lastUsedIp && <span className="truncate text-xs text-muted-foreground tabular-nums">from {token.lastUsedIp}</span>}
    </span>
  )
}

/** Service, scope and allow-list first: that is what a reviewer checks; expiry and last use say whether it is alive. */
export function MachineTokensTable({ tokens, canRenew }: { readonly tokens: ReadonlyArray<MachineToken>; readonly canRenew: boolean }) {
  return (
    <TableFrame>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[58%] sm:w-[30%] lg:w-[22%]">Service</TableHead>
            <TableHead className="hidden sm:table-cell">Can receive</TableHead>
            <TableHead className="w-36">Expires</TableHead>
            <TableHead className="hidden w-36 md:table-cell">Last used</TableHead>
            <TableHead className="hidden w-40 xl:table-cell">Created by</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((token) => {
            const revoked = token.revokedAt !== null
            return (
              <TableRow key={token.id} className={cn("align-top", revoked && "text-muted-foreground")}>
                <TableCell>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{token.name}</span>
                    <span className="flex min-w-0 items-baseline gap-1.5 overflow-hidden text-xs text-muted-foreground">
                      <code className="hidden shrink-0 font-mono sm:inline">{token.prefix}…</code>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      {token.projectId === null ? <span>Org-wide</span> : <EntityName entity={{ kind: "project", id: token.projectId }} />}
                    </span>
                    <div className="mt-1.5 sm:hidden">
                      <AllowList ids={token.allow} visible={2} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-normal sm:table-cell">
                  <AllowList ids={token.allow} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <TokenExpiry token={token} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <LastUsed token={token} />
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <EntityName entity={{ kind: "user", id: token.createdBy }} />
                </TableCell>
                <TableCell>
                  {!revoked && (
                    <div className="flex justify-end gap-1">
                      {canRenew && <RenewMachineTokenButton token={token} />}
                      <RevokeMachineTokenButton id={token.id} name={token.name} />
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

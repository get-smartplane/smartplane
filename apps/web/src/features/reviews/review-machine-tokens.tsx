import type { MachineToken, MachineTokenId, ReviewedMachineToken } from "@pc/domain"
import { TableFrame } from "@/components/layout/table-frame"
import { useQueryData } from "@/components/query/use-query-data"
import { EntityName } from "@/components/status/entity-name"
import { StatusText } from "@/components/status/status-badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AllowList } from "@/features/machine-tokens/allow-list"
import { machineTokensAtom } from "@/features/machine-tokens/atoms"
import { RevokeMachineTokenButton } from "@/features/machine-tokens/revoke-machine-token-button"
import { formatDate, formatRelative, isPast } from "@/lib/format"

const none: ReadonlyArray<MachineToken> = []

/** The snapshot says what existed; the live list says whether it still works, so Revoke shows only while it does. */
function TokenState({ snapshot, current }: { readonly snapshot: ReviewedMachineToken; readonly current: MachineToken | undefined }) {
  if (current?.revokedAt != null) return <StatusText tone="danger">Revoked {formatDate(current.revokedAt)}</StatusText>
  if (isPast(current?.expiresAt ?? snapshot.expiresAt)) return <StatusText tone="neutral">Expired</StatusText>
  return (
    <span className="inline-flex justify-end">
      <RevokeMachineTokenButton id={snapshot.machineTokenId} name={snapshot.name} />
    </span>
  )
}

/**
 * Machine tokens outlive their creator's membership, so a campaign lists the live ones it found with their
 * creator and allow-list. A `reviews:manage` reviewer may revoke one here; it is not a keep/revoke item.
 */
export function ReviewMachineTokens({ tokens }: { readonly tokens: ReadonlyArray<ReviewedMachineToken> }) {
  const current = new Map<MachineTokenId, MachineToken>(useQueryData(machineTokensAtom, none).map((token) => [token.id, token]))
  if (tokens.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-[1.0625rem] leading-6">Machine tokens</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Deployed services' credentials. They keep working after their creator leaves; revoke any that no service should still hold.
        </p>
      </div>
      <TableFrame>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[46%] sm:w-[30%]">Service</TableHead>
              <TableHead className="hidden sm:table-cell">Can receive</TableHead>
              <TableHead className="hidden w-44 md:table-cell">Created by</TableHead>
              <TableHead className="w-36 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => (
              <TableRow key={token.machineTokenId} className="align-top">
                <TableCell className="whitespace-normal">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{token.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {token.projectId === null ? "Org-wide" : <EntityName entity={{ kind: "project", id: token.projectId }} className="inline-flex" />}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Expires {formatDate(token.expiresAt)} · {token.lastUsedAt === null ? "never used" : `used ${formatRelative(token.lastUsedAt)}`}
                    </span>
                    <div className="mt-1.5 sm:hidden">
                      <AllowList ids={token.allow} visible={2} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-normal sm:table-cell">
                  <AllowList ids={token.allow} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <EntityName entity={{ kind: "user", id: token.createdBy }} withDetail />
                </TableCell>
                <TableCell className="text-right">
                  <TokenState snapshot={token} current={current.get(token.machineTokenId)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </section>
  )
}

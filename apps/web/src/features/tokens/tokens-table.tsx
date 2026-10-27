import type { AccessToken } from "@pc/domain"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatRelative } from "@/lib/format"
import { RevokeTokenButton } from "./revoke-token-button"
import { isTokenLive, TokenStatus } from "./token-status"
import { TableFrame } from "@/components/layout/table-frame"

export function TokensTable({ tokens }: { readonly tokens: ReadonlyArray<AccessToken> }) {
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Token</TableHead>
            <TableHead className="hidden sm:table-cell">Type</TableHead>
            <TableHead className="hidden md:table-cell">Last used</TableHead>
            <TableHead className="hidden md:table-cell">Expires</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((token) => (
            <TableRow key={token.id}>
              <TableCell>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-semibold">{token.name}</span>
                  <code className="text-xs text-muted-foreground">{token.prefix}…</code>
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{token.kind === "personal" ? "Personal" : "Service account"}</TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                {token.lastUsedAt ? formatRelative(token.lastUsedAt) : "Never"}
              </TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{formatDate(token.expiresAt)}</TableCell>
              <TableCell>
                <TokenStatus token={token} />
              </TableCell>
              <TableCell>{isTokenLive(token) && <RevokeTokenButton token={token} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

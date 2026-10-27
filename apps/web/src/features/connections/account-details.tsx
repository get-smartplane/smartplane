import type { Connection } from "@pc/domain"
import type { ReactNode } from "react"
import { StatusText } from "@/components/status/status-badge"
import { formatDateTime, formatRelative } from "@/lib/format"
import { accountLabel, connectionTone } from "./account-label"

const Row = ({ term, children }: { readonly term: string; readonly children: ReactNode }) => (
  <>
    <dt className="text-muted-foreground">{term}</dt>
    <dd className="min-w-0 truncate">{children}</dd>
  </>
)

/** One connected account: its status, the provider's name for it, and who connected it when. */
export function AccountDetails({ connection, emptyText }: { readonly connection: Connection | null; readonly emptyText: string }) {
  const status = connectionTone(connection)
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
      <Row term="Status">
        <StatusText tone={status.tone}>{status.label}</StatusText>
      </Row>
      {connection === null ? (
        <Row term="Account">
          <span className="text-muted-foreground">{emptyText}</span>
        </Row>
      ) : (
        <>
          <Row term="Account">{accountLabel(connection.accountIdentity) ?? <span className="text-muted-foreground">Not shared by the provider</span>}</Row>
          <Row term="Connected by">{connection.connectedBy.email ?? connection.connectedBy.userId}</Row>
          <Row term="Connected">
            <span title={formatDateTime(connection.connectedAt)}>{formatRelative(connection.connectedAt)}</span>
          </Row>
          {connection.refreshedAt !== null && <Row term="Token refreshed">{formatRelative(connection.refreshedAt)}</Row>}
        </>
      )}
    </dl>
  )
}

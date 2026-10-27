import type { MyConnection } from "@pc/domain"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlugZap } from "lucide-react"
import { useCallback } from "react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { Panel } from "@/components/layout/panel"
import { QueryView } from "@/components/query/query-view"
import { OAuthFailureAlert } from "@/features/integrations/oauth-failure-alert"
import { AccountDetails } from "./account-details"
import { myConnectionsAtom } from "./atoms"
import { ConnectButton } from "./connect-button"
import type { ConnectionReturn } from "./connection-return"
import { DisconnectAccountButton } from "./disconnect-account-button"
import { useConnectionReturn } from "./use-connection-return"

/** The caller's own accounts on per-user resources: where the gateway's "connect your account" link leads. */
export function MyConnectionsPage({ search }: { readonly search: ConnectionReturn }) {
  const navigate = useNavigate()
  const clear = useCallback(() => void navigate({ to: "/connections", search: search.resource === undefined ? {} : { resource: search.resource }, replace: true }), [navigate, search.resource])
  const failure = useConnectionReturn(search, clear)
  return (
    <Page>
      <PageHeader
        title="My connections"
        description="Resources set up so each person uses their own account. Connect yours here; only your own calls use it, and nobody else can read it."
      />
      {failure && <OAuthFailureAlert failure={failure} />}
      <QueryView atom={myConnectionsAtom}>
        {(entries) =>
          entries.length === 0
            ? <EmptyState icon={PlugZap} title="Nothing to connect" description="None of the resources you can use asks for your own account. Shared accounts are connected by admins." />
            : <div className="grid gap-4 md:grid-cols-2">{entries.map((entry) => <ConnectionCard key={entry.resource.id} entry={entry} highlighted={entry.resource.id === search.resource} />)}</div>}
      </QueryView>
    </Page>
  )
}

function ConnectionCard({ entry, highlighted }: { readonly entry: MyConnection; readonly highlighted: boolean }) {
  const { resource, connection, method } = entry
  return (
    <Panel
      title={resource.name}
      className={highlighted ? "ring-2 ring-ring/50" : undefined}
      action={<Link to="/resources/$resourceId" params={{ resourceId: resource.id }} className="text-xs text-muted-foreground hover:underline">Details</Link>}
    >
      <div className="flex flex-col gap-4 p-4">
        <AccountDetails connection={connection} emptyText="Not connected: your calls through it are refused until you connect." />
        <div className="flex flex-wrap gap-2">
          <ConnectButton resource={resource} method={method} label={connection === null ? "Connect your account" : "Reconnect"} variant={connection === null ? "default" : "outline"} />
          {connection !== null && <DisconnectAccountButton resource={resource} own />}
        </div>
      </div>
    </Panel>
  )
}

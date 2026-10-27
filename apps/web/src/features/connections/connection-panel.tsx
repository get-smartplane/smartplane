import type { Resource, ResourceConnections } from "@pc/domain"
import { Panel } from "@/components/layout/panel"
import { QueryView } from "@/components/query/query-view"
import { AccountDetails } from "./account-details"
import { resourceConnectionsAtom } from "./atoms"
import { ConnectButton, takesJson } from "./connect-button"
import { DisconnectAccountButton } from "./disconnect-account-button"
import { ModeSwitch } from "./mode-switch"

/** The "Connection" panel of a credentialed resource: whose account calls use, and connecting it. */
export function AccountConnectionPanel({ resource }: { readonly resource: Resource }) {
  return (
    <QueryView atom={resourceConnectionsAtom(resource.id)}>
      {(state) => <PanelBody resource={resource} state={state} />}
    </QueryView>
  )
}

function PanelBody({ resource, state }: { readonly resource: Resource; readonly state: ResourceConnections }) {
  const perUser = state.mode === "per_user"
  const connection = perUser ? state.mine : state.shared
  const connectable = state.method === "oauth" || state.method === "secret"
  // Shared accounts are managed by admins; a per-user account belongs to whoever is looking.
  const mayConnect = connectable && (perUser || state.canManage)
  const label = connection === null ? (perUser ? "Connect your account" : "Connect") : "Reconnect"
  return (
    <Panel title="Connection" action={state.canManage && <ModeSwitch resourceId={resource.id} mode={state.mode} disabled={false} />}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">
          {perUser
            ? "Each person connects their own account. Calls use the caller's own; nobody else, admins included, can use or read it."
            : "One shared account for everyone with a grant. Each person's grants and the rules are still checked on every call, before the account is used."}
        </p>
        {state.method === "none" && <p className="text-sm">This resource sends no credential.</p>}
        {state.method === "secret_reference" && <p className="text-sm">Uses the shared secret chosen in this resource's settings.</p>}
        {connectable && (
          <AccountDetails
            connection={connection}
            emptyText={perUser ? "You have not connected your account." : state.canManage ? "Nobody has connected the shared account yet." : "An admin has not connected the shared account yet."}
          />
        )}
        {(mayConnect || (connection !== null && (perUser || state.canManage))) && (
          <div className="flex flex-wrap gap-2">
            {mayConnect && <ConnectButton resource={resource} method={state.method} label={label} variant={connection === null ? "default" : "outline"} json={takesJson(resource)} />}
            {connection !== null && (perUser || state.canManage) && <DisconnectAccountButton resource={resource} own={perUser} />}
          </div>
        )}
      </div>
    </Panel>
  )
}

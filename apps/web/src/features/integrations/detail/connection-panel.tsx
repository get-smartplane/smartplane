import type { IntegrationConfig, IntegrationPiece, Resource } from "@pc/domain"
import type { ReactNode } from "react"
import { Panel } from "@/components/layout/panel"
import { EntityName } from "@/components/status/entity-name"
import { StatusText } from "@/components/status/status-badge"
import { useCan } from "@/features/auth/me-context"
import { authTypeLabel, methodMeta } from "../auth-methods"
import { RedirectUri } from "../connect/redirect-uri"
import { connectionStatus } from "./connection-status"
import { DisconnectButton } from "./disconnect-button"

const Row = ({ term, children }: { readonly term: string; readonly children: ReactNode }) => (
  <>
    <dt className="text-muted-foreground">{term}</dt>
    <dd className="min-w-0">{children}</dd>
  </>
)

interface ConnectionPanelProps {
  readonly resource: Resource
  readonly config: IntegrationConfig
  readonly piece: IntegrationPiece
}

/** How the integration signs in, which secrets it uses (by name only), and its OAuth state. */
export function ConnectionPanel({ resource, config, piece }: ConnectionPanelProps) {
  const canManage = useCan("resources:manage")
  const { connection } = config
  const auth = piece.auth.find((candidate) => candidate.type === connection.type)
  const status = connectionStatus(connection, config.accountMode)
  const signedIn = connection.type === "oauth2" && connection.status !== "not_connected"
  return (
    <Panel title="Connection" action={canManage && signedIn && <DisconnectButton resource={resource} />}>
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-4 text-sm">
        <Row term="Method">{auth ? methodMeta(auth, piece.displayName).label : authTypeLabel[connection.type]}</Row>
        <Row term="Status">
          <StatusText tone={status.tone}>{status.label}</StatusText>
        </Row>
        {connection.type !== "none" && connection.type !== "oauth2" && connection.secretId !== undefined && (
          <Row term="Credential">
            <EntityName entity={{ kind: "resource", id: connection.secretId }} />
          </Row>
        )}
        {connection.type === "oauth2" && (
          <>
            <Row term="Client ID">
              <code className="block truncate text-xs" title={connection.clientId}>{connection.clientId}</code>
            </Row>
            <Row term="Client secret">
              <EntityName entity={{ kind: "resource", id: connection.clientSecretId }} />
            </Row>
          </>
        )}
      </dl>
      {connection.type === "oauth2" && connection.status !== "connected" && canManage && (
        <div className="border-t p-4">
          <RedirectUri pieceId={piece.id} pieceName={piece.displayName} />
        </div>
      )}
    </Panel>
  )
}

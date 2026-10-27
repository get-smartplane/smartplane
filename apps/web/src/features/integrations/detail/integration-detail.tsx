import type { IntegrationConfig, IntegrationPiece, Resource } from "@pc/domain"
import { BackLink } from "@/components/layout/back-link"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status/status-badge"
import { useCan } from "@/features/auth/me-context"
import { CreateGrantDialog } from "@/features/access/create-grant-dialog"
import { AccountConnectionPanel } from "@/features/connections/connection-panel"
import { ResourceGrants } from "@/features/resources/resource-grants"
import { ActionList } from "../actions/action-list"
import { enabledActions, isOffered } from "../actions/action-groups"
import { methodMeta } from "../auth-methods"
import { OAuthFailureAlert } from "../oauth-failure-alert"
import type { OAuthFailure } from "../oauth-return"
import { PieceLogo } from "../piece-logo"
import { ConnectionPanel } from "./connection-panel"
import { connectionStatus } from "./connection-status"
import { EditActionsDialog } from "./edit-actions-dialog"
import { ReconnectButton } from "./reconnect-button"

interface IntegrationDetailProps {
  readonly resource: Resource
  readonly config: IntegrationConfig
  readonly piece: IntegrationPiece
  readonly failure: OAuthFailure | null
}

/** An org's integration: can agents use it right now, what can they do with it, and who may. */
export function IntegrationDetail({ resource, config, piece, failure }: IntegrationDetailProps) {
  const canManage = useCan("resources:manage")
  const canGrant = useCan("grants:manage")
  const { connection } = config
  const status = connectionStatus(connection, config.accountMode)
  const offered = piece.actions.filter(isOffered)
  const enabled = enabledActions(piece.actions, config.actions)
  const oauth = connection.type === "oauth2" && config.accountMode !== "per_user"
  const needsSignIn = oauth && connection.status !== "connected"
  const auth = piece.auth.find((candidate) => candidate.type === connection.type)
  const reconnect = canManage && oauth && <ReconnectButton resourceId={resource.id} label={connection.status === "not_connected" ? `Connect with ${piece.displayName}` : "Reconnect"} variant={needsSignIn ? "default" : "outline"} />
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <BackLink to="/resources" search={{ kind: "integration" }}>Resources</BackLink>
        <div className="flex items-start gap-4">
          <PieceLogo url={piece.logoUrl} name={piece.displayName} size="lg" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <PageHeader
              title={resource.name}
              status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
              description={resource.description || [piece.displayName, auth ? methodMeta(auth, piece.displayName).label : null, `${enabled.length} of ${offered.length} actions offered`].filter(Boolean).join(" · ")}
              actions={
                <>
                  {reconnect}
                  {canGrant && <CreateGrantDialog resourceId={resource.id} variant={needsSignIn ? "outline" : "default"} />}
                </>
              }
            />
          </div>
        </div>
      </div>
      {failure && <OAuthFailureAlert failure={failure} />}
      {!failure && status.hint && <OAuthFailureAlert failure={{ title: status.label, description: status.hint }} destructive={status.tone === "danger"} />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Section
          title="What agents can do"
          description="Each action becomes a tool for anyone granted access. Reads need a use grant; changes need write."
          aside={canManage && <EditActionsDialog resource={resource} config={config} offered={offered} />}
        >
          <ActionList actions={enabled} />
        </Section>
        <div className="flex flex-col gap-6">
          <ConnectionPanel resource={resource} config={config} piece={piece} />
          <AccountConnectionPanel resource={resource} />
        </div>
      </div>
      {canGrant && <ResourceGrants resource={resource} />}
    </div>
  )
}

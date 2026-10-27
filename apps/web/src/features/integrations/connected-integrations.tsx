import type { IntegrationPieceSummary, Resource } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { StatusText } from "@/components/status/status-badge"
import { connectionStatus } from "./detail/connection-status"
import { PieceLogo } from "./piece-logo"

interface ConnectedIntegrationsProps {
  readonly integrations: ReadonlyArray<Resource>
  readonly pieces: ReadonlyArray<IntegrationPieceSummary>
}

/** The org's own integrations, each with its connection state; opening one leads to its resource page. */
export function ConnectedIntegrations({ integrations, pieces }: ConnectedIntegrationsProps) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {integrations.map((resource) => {
        if (resource.config.kind !== "integration") return null
        const pieceId = resource.config.pieceId
        const piece = pieces.find((candidate) => candidate.id === pieceId)
        const status = connectionStatus(resource.config.connection)
        return (
          <li key={resource.id}>
            <Link
              to="/resources/$resourceId"
              params={{ resourceId: resource.id }}
              className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors outline-none hover:border-foreground/20 hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <PieceLogo url={piece?.logoUrl} name={piece?.displayName ?? pieceId} size="sm" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-semibold">{resource.name}</span>
                <span className="truncate text-xs text-muted-foreground">{piece?.displayName ?? pieceId}</span>
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                <StatusText tone={status.tone}>{status.label}</StatusText>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

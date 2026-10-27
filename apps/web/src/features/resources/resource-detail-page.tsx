import { isInlineSkill, type ResourceId } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, type ReactNode } from "react"
import { Page } from "@/components/layout/page"
import { QueryView } from "@/components/query/query-view"
import type { ConnectionReturn } from "@/features/connections/connection-return"
import { useConnectionReturn } from "@/features/connections/use-connection-return"
import { pieceAtom } from "@/features/integrations/atoms"
import { OAuthFailureAlert } from "@/features/integrations/oauth-failure-alert"
import { IntegrationDetail } from "@/features/integrations/detail/integration-detail"
import type { OAuthReturn } from "@/features/integrations/oauth-return"
import { useOAuthReturn } from "@/features/integrations/use-oauth-return"
import { NotFoundPage } from "@/features/shell/not-found-page"
import { SkillDetail } from "@/features/skills/detail/skill-detail"
import { allResourcesAtom } from "./atoms"
import { ResourceOverview } from "./resource-overview"

interface ResourceDetailPageProps {
  readonly resourceId: ResourceId
  /** Set when the API's OAuth callback sends the browser back here. */
  readonly oauth: OAuthReturn
  /** Set when the API's connection callback sends the browser back here. */
  readonly connection: ConnectionReturn
}

export function ResourceDetailPage({ resourceId, oauth, connection }: ResourceDetailPageProps) {
  const navigate = useNavigate()
  const clear = useCallback(() => void navigate({ to: "/resources/$resourceId", params: { resourceId }, search: {}, replace: true }), [navigate, resourceId])
  const connectionFailure = useConnectionReturn(connection, clear)
  return (
    <Page>
      {connectionFailure && <OAuthFailureAlert failure={connectionFailure} />}
      <QueryView atom={allResourcesAtom}>
        {(resources) => {
          const resource = resources.find((candidate) => candidate.id === resourceId)
          if (resource === undefined) return <NotFoundPage />
          const { config } = resource
          if (config.kind === "skill" && !isInlineSkill(config)) return <SkillDetail resource={resource} config={config} />
          if (config.kind !== "integration") return <ResourceOverview resource={resource} />
          return (
            <QueryView atom={pieceAtom(config.pieceId)}>
              {(piece) => <IntegrationReturn oauth={oauth} name={resource.name} provider={piece.displayName} clear={clear}>{(failure) => <IntegrationDetail resource={resource} config={config} piece={piece} failure={failure} />}</IntegrationReturn>}
            </QueryView>
          )
        }}
      </QueryView>
    </Page>
  )
}

/** Reads the OAuth outcome once the integration's name is known, so the toast can name it. */
function IntegrationReturn({ oauth, name, provider, clear, children }: { readonly oauth: OAuthReturn; readonly name: string; readonly provider: string; readonly clear: () => void; readonly children: (failure: ReturnType<typeof useOAuthReturn>) => ReactNode }) {
  return children(useOAuthReturn(oauth, name, provider, clear))
}

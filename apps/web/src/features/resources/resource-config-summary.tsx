import { defaultApiMethods, type Resource, type ResourceId } from "@pc/domain"
import { Lock } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { StatusText } from "@/components/status/status-badge"
import { catalogAtom } from "@/features/integrations/atoms"
import { authTypeLabel } from "@/features/integrations/auth-methods"
import { connectionStatus } from "@/features/integrations/detail/connection-status"
import { SkillSummary } from "@/features/skills/source/skill-summary"
import { allResourcesAtom } from "./atoms"

const Mono = ({ children }: { readonly children: string }) => (
  <span className="truncate font-mono text-xs text-muted-foreground">{children}</span>
)

type ApiConfig = Extract<Resource["config"], { readonly kind: "api" }>
type IntegrationConfig = Extract<Resource["config"], { readonly kind: "integration" }>

/** Which tool it is, how it signs in, and whether agents can use it right now. */
function IntegrationSummary({ config }: { readonly config: IntegrationConfig }) {
  const piece = useQueryData(catalogAtom, []).find((candidate) => candidate.id === config.pieceId)
  const status = connectionStatus(config.connection)
  const actions = config.actions ? ` · ${config.actions.length} actions` : ""
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span className="truncate">{`${piece?.displayName ?? config.pieceId} · ${authTypeLabel[config.connection.type]}${actions}`}</span>
      <StatusText tone={status.tone}>{status.label}</StatusText>
    </span>
  )
}

const apiSummary = ({ baseUrl, allowedMethods, allowedPaths }: ApiConfig) => {
  const paths = allowedPaths ? [`${allowedPaths.length} path ${allowedPaths.length === 1 ? "prefix" : "prefixes"}`] : []
  return [baseUrl, (allowedMethods ?? defaultApiMethods).join(" "), ...paths].join(" · ")
}

/** One line describing a resource's config. Secrets show only that a value exists. */
export function ResourceConfigSummary({ config, resourceId }: { readonly config: Resource["config"]; readonly resourceId?: ResourceId }) {
  const resources = useQueryData(allResourcesAtom, [])
  const nameOf = (id: string) => resources.find((resource) => resource.id === id)?.name ?? id
  switch (config.kind) {
    case "mcp_server":
      return <Mono>{`${config.url} · ${config.transport === "sse" ? "SSE" : "HTTP"}`}</Mono>
    case "tool":
      return <Mono>{`${nameOf(config.serverId)} → ${config.toolName}`}</Mono>
    case "skill":
      return <SkillSummary config={config} resourceId={resourceId} />
    case "database":
      return <Mono>{`${config.engine}${config.readOnly ? " · read-only" : ""}`}</Mono>
    case "api":
      return <Mono>{apiSummary(config)}</Mono>
    case "integration":
      return <IntegrationSummary config={config} />
    case "secret":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" />
          Encrypted · value hidden
        </span>
      )
    case "variable":
      return <Mono>{config.value}</Mono>
  }
}

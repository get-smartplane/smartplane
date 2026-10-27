import type { Resource } from "@pc/domain"
import { BackLink } from "@/components/layout/back-link"
import { PageHeader } from "@/components/layout/page-header"
import { Panel } from "@/components/layout/panel"
import { EntityName } from "@/components/status/entity-name"
import { CreateGrantDialog } from "@/features/access/create-grant-dialog"
import { AccountConnectionPanel } from "@/features/connections/connection-panel"
import { useCan } from "@/features/auth/me-context"
import { ResourceToolsPanel } from "@/features/mcp-catalog/resource-tools-panel"
import { isCatalogKind, kindMeta } from "./kinds"
import { ResourceConfigSummary } from "./resource-config-summary"
import { ResourceGrants } from "./resource-grants"

/** The detail page every kind shares: what it is, where it is visible, and who can reach it. */
export function ResourceOverview({ resource }: { readonly resource: Resource }) {
  const canGrant = useCan("grants:manage")
  const { label, icon: Icon } = kindMeta[resource.config.kind]
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        {isCatalogKind(resource.config.kind) ? <BackLink to="/resources">Resources</BackLink> : <BackLink to="/secrets">Secrets & variables</BackLink>}
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <PageHeader title={resource.name} description={resource.description || kindMeta[resource.config.kind].description} actions={canGrant && <CreateGrantDialog resourceId={resource.id} />} />
          </div>
        </div>
      </div>
      <Panel title={label}>
        <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-4 text-sm">
          <dt className="text-muted-foreground">Settings</dt>
          <dd className="flex min-w-0">
            <ResourceConfigSummary config={resource.config} />
          </dd>
          <dt className="text-muted-foreground">Visible in</dt>
          <dd>{resource.projectId === null ? "Org-wide" : <EntityName entity={{ kind: "project", id: resource.projectId }} />}</dd>
        </dl>
      </Panel>
      {(resource.config.kind === "mcp_server" || resource.config.kind === "api") && <AccountConnectionPanel resource={resource} />}
      {resource.config.kind === "mcp_server" && <ResourceToolsPanel resource={resource} />}
      {canGrant && <ResourceGrants resource={resource} />}
    </div>
  )
}

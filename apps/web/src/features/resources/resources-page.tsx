import { useNavigate } from "@tanstack/react-router"
import { Boxes } from "lucide-react"
import { useCallback } from "react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { useCan } from "@/features/auth/me-context"
import { OAuthFailureAlert } from "@/features/integrations/oauth-failure-alert"
import { useOAuthReturn } from "@/features/integrations/use-oauth-return"
import { resourcesAtom } from "./atoms"
import { CreateResourceDialog } from "./create-resource-dialog"
import { KindTabs } from "./kind-tabs"
import { inCatalog, kindMeta } from "./kinds"
import type { ResourceSearch } from "./resource-search"
import { ResourcesTable } from "./resources-table"
import { SharedVariablesLink } from "./shared-variables-link"

export function ResourcesPage({ search }: { readonly search: ResourceSearch }) {
  const canManage = useCan("resources:manage")
  // Without manage or browse, the API lists only what this member holds a grant on.
  const sharedOnly = !canManage && !useCan("resources:browse")
  const { kind } = search
  const navigate = useNavigate()
  const clear = useCallback(() => void navigate({ to: "/resources", search: kind ? { kind } : {}, replace: true }), [navigate, kind])
  const failure = useOAuthReturn(search, "The integration", "The provider", clear)
  return (
    <Page>
      <PageHeader
        title={sharedOnly ? "Your tools" : "Resources"}
        description={
          sharedOnly
            ? "What you and your agents can use through Smartplane, shared with you, your team or your role."
            : "The tools and data agents can reach through Smartplane, once granted."
        }
        actions={canManage && <CreateResourceDialog key={kind ?? "all"} initialKind={kind} />}
      />
      {failure && <OAuthFailureAlert failure={failure} />}
      <KindTabs kind={kind} />
      <QueryView atom={resourcesAtom(kind === undefined ? {} : { kind })}>
        {(listed) => {
          // Secrets and variables are listed under Secrets & variables (`/secrets`).
          const resources = listed.filter(inCatalog)
          return resources.length === 0 && sharedOnly ? (
            <EmptyState
              icon={kind ? kindMeta[kind].icon : Boxes}
              title={kind ? `No ${kindMeta[kind].plural.toLowerCase()} shared with you` : "Nothing has been shared with you yet"}
              description="Ask an admin."
            />
          ) : resources.length === 0 ? (
            <EmptyState
              icon={kind ? kindMeta[kind].icon : Boxes}
              title={kind ? `No ${kindMeta[kind].plural.toLowerCase()} yet` : "Add what agents may reach"}
              description={
                kind
                  ? kindMeta[kind].description
                  : "Start with an MCP server your team already uses, such as GitHub or Linear. You decide who may use it next."
              }
              action={canManage && <CreateResourceDialog key={`empty-${kind ?? "all"}`} initialKind={kind} />}
            />
          ) : (
            <ResourcesTable resources={resources} />
          )
        }}
      </QueryView>
      {!canManage && <SharedVariablesLink />}
    </Page>
  )
}

import type { Resource } from "@pc/domain"
import { Plus } from "lucide-react"
import type { ReactNode } from "react"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { QueryView } from "@/components/query/query-view"
import { Button } from "@/components/ui/button"
import { useCan } from "@/features/auth/me-context"
import { MachineTokensSection } from "@/features/machine-tokens/machine-tokens-section"
import { allResourcesAtom } from "@/features/resources/atoms"
import { secretStatusesAtom } from "./atoms"
import { CreateValueDialog } from "./create-value-dialog"
import { MemberSecretsTable } from "./member-secrets-table"
import { SecretsTable } from "./secrets-table"
import { usersOfSecrets } from "./used-by"
import { VariablesTable } from "./variables-table"

const Empty = ({ children }: { readonly children: ReactNode }) => (
  <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">{children}</p>
)

const count = (items: ReadonlyArray<unknown>) => <span className="tabular-nums">{items.length}</span>

const run = <code className="font-mono text-foreground">smartplane run</code>

function ManagedSecrets({ resources, secrets }: { readonly resources: ReadonlyArray<Resource>; readonly secrets: ReadonlyArray<Resource> }) {
  return (
    <Section
      title="Secrets"
      description="Encrypted on save; nobody can read a value back. By default a secret is gateway only: agents use it through tools, and it never leaves Smartplane."
      aside={count(secrets)}
    >
      {secrets.length === 0 ? (
        <Empty>No secrets yet. Add one here, or create it while adding the server, API or database that needs it.</Empty>
      ) : (
        <QueryView atom={secretStatusesAtom}>
          {(statuses) => (
            <SecretsTable secrets={secrets} statuses={new Map(statuses.map((status) => [status.resourceId, status]))} users={usersOfSecrets(resources)} />
          )}
        </QueryView>
      )}
    </Section>
  )
}

/** The API lists a member only deliverable secrets they hold a `use` grant on, so the section is absent otherwise. */
function ReceivableSecrets({ secrets }: { readonly secrets: ReadonlyArray<Resource> }) {
  if (secrets.length === 0) return null
  return (
    <Section title="Secrets" description={<>Values never show here. <code className="font-mono whitespace-nowrap text-foreground">smartplane run -- &lt;command&gt;</code> starts a command with them in its environment.</>} aside={count(secrets)}>
      <QueryView atom={secretStatusesAtom}>
        {(statuses) => <MemberSecretsTable secrets={secrets} statuses={new Map(statuses.map((status) => [status.resourceId, status]))} />}
      </QueryView>
    </Section>
  )
}

/**
 * Credentials and configuration values, apart from the tools that use them. Managers see every secret and
 * decide which may be delivered; members see the deliverable ones they may receive, and the variables
 * shared with them. One title for both, matching the breadcrumb and the sidebar.
 */
export function SecretsPage() {
  const canManage = useCan("resources:manage")
  const canManageTokens = useCan("tokens:manage")
  return (
    <Page>
      <PageHeader
        title="Secrets & variables"
        description={
          canManage
            ? "The credentials your resources authenticate with, plain configuration values, and what deployed services may receive."
            : "Shared with you, by the env names your commands receive them under. Agents read variables with variables_get."
        }
        actions={
          canManage && (
            <>
              <CreateValueDialog kind="variable" trigger={<Button variant="outline"><Plus />Add variable</Button>} />
              <CreateValueDialog kind="secret" trigger={<Button><Plus />Add secret</Button>} />
            </>
          )
        }
      />
      <QueryView atom={allResourcesAtom}>
        {(resources) => {
          const secrets = resources.filter((resource) => resource.config.kind === "secret")
          const variables = resources.filter((resource) => resource.config.kind === "variable")
          return (
            <div className="flex flex-col gap-10">
              {canManage ? <ManagedSecrets resources={resources} secrets={secrets} /> : <ReceivableSecrets secrets={secrets} />}
              <Section
                title="Variables"
                description={
                  canManage ? (
                    <>Plain text, so never for anything sensitive. Always deliverable: {run} and machine tokens receive them under their env name.</>
                  ) : (
                    <>Always deliverable: {run} puts them in your command's environment under their env name.</>
                  )
                }
                aside={count(variables)}
              >
                {variables.length === 0 ? (
                  <Empty>{canManage ? "No variables yet. Add values such as a region or a default project key." : "No variables have been shared with you yet."}</Empty>
                ) : (
                  <VariablesTable variables={variables} canManage={canManage} />
                )}
              </Section>
              {canManage && canManageTokens && <MachineTokensSection />}
            </div>
          )
        }}
      </QueryView>
    </Page>
  )
}

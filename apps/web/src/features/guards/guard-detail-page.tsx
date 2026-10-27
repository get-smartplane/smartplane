import type { GuardId } from "@pc/domain"
import { BackLink } from "@/components/layout/back-link"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { NotFoundPage } from "@/features/shell/not-found-page"
import { guardsAtom } from "./atoms"
import { CompileCard } from "./compile-card"
import { GuardStatusBadge } from "./guard-status-badge"
import { GuardSettingsCard } from "./guard-settings-card"
import { GuardTestPanel } from "./guard-test-panel"
import { RenameGuardDialog } from "./rename-guard-dialog"
import { RuleProgress } from "./rule-progress"
import { VerifyPoller } from "./verify/verify-poller"
import { TestedCallsCard } from "./tested-calls-card"

export function GuardDetailPage({ guardId }: { readonly guardId: GuardId }) {
  return (
    <Page>
      <QueryView atom={guardsAtom}>
        {(guards) => {
          const guard = guards.find((candidate) => candidate.id === guardId)
          if (guard === undefined) return <NotFoundPage />
          return (
            <div className="flex flex-col gap-7">
              <VerifyPoller guard={guard} />
              <PageHeader
                back={<BackLink to="/guards">Rules</BackLink>}
                title={guard.name}
                status={
                  <>
                    <GuardStatusBadge status={guard.status} />
                    <RenameGuardDialog guard={guard} />
                  </>
                }
                description={<RuleProgress guard={guard} />}
              />
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <CompileCard guard={guard} />
                {/* Keyed by version so the form resets to saved values after each save or compile. */}
                <GuardSettingsCard key={`${guard.compiledVersion}-${guard.mode}-${guard.threshold}-${JSON.stringify(guard.approvers)}`} guard={guard} />
              </div>
              <TestedCallsCard guard={guard} />
              <GuardTestPanel guard={guard} />
            </div>
          )
        }}
      </QueryView>
    </Page>
  )
}

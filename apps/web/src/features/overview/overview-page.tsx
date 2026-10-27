import { Page } from "@/components/layout/page"
import { useCan } from "@/features/auth/me-context"
import { FinishSetupCard } from "@/features/onboarding/finish-setup-card"
import { WelcomeRedirect } from "@/features/onboarding/welcome-redirect"
import { AttentionPanel } from "./attention/attention-panel"
import { DecisionsPanel } from "./decisions/decisions-panel"
import { IntegrityPanel } from "./integrity-panel"
import { OverviewStats } from "./overview-stats"
import { ReachByKind } from "./reach-by-kind"
import { SkyBand } from "./sky-band"

/** The control plane's home: the endpoint, what needs a person, what agents did, what they can reach. */
export function OverviewPage() {
  const canReadAudit = useCan("audit:read")
  const canSeeResources = useCan("resources:read")
  return (
    <Page className="gap-6">
      <WelcomeRedirect />
      <SkyBand />
      <FinishSetupCard />
      <OverviewStats />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <AttentionPanel />
          {canReadAudit && <DecisionsPanel />}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {canSeeResources && <ReachByKind />}
          {canReadAudit && <IntegrityPanel />}
        </div>
      </div>
    </Page>
  )
}

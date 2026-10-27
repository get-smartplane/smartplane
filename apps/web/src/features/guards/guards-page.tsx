import { ShieldCheck } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { guardsAtom } from "./atoms"
import { CreateGuardDialog } from "./create-guard-dialog"
import { RulesList } from "./rules-list"

export function GuardsPage() {
  return (
    <Page>
      <PageHeader
        title="Rules"
        description="Plain-English rules checked before every agent action. If a check cannot run, the call is blocked."
        actions={<CreateGuardDialog />}
      />
      <QueryView atom={guardsAtom}>
        {(guards) => (
          // One tree either way, so the quick-add row keeps its focus and rows when the first rule lands.
          <div className="flex flex-col gap-6">
            {guards.length === 0 && (
              <EmptyState
                icon={ShieldCheck}
                title="Write your first rule"
                description="Say what agents must never do, such as “Nobody deletes reports from the Q3 folder.” Type one below and press Enter, or use New rule. You review how it will be checked before it goes live."
                action={<CreateGuardDialog />}
              />
            )}
            <RulesList guards={guards} />
          </div>
        )}
      </QueryView>
    </Page>
  )
}

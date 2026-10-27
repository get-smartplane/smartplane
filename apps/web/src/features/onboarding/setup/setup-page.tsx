import type { OrgSetup } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { ShieldAlert } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { QueryView } from "@/components/query/query-view"
import { Button } from "@/components/ui/button"
import { progressAtom } from "../atoms"
import { FocusLayout } from "./focus-layout"
import { SetupStepView } from "./setup-step-view"
import type { SetupSearch } from "./setup-search"
import { StepIndicator } from "./step-indicator"
import { viewOf } from "./steps"
import { useSetup } from "./use-setup"

const exit = (
  <Button variant="ghost" size="sm" className="text-sky-ink hover:bg-white/45 hover:text-sky-ink dark:hover:bg-white/10" asChild>
    <Link to="/">Finish later</Link>
  </Button>
)

/** The admin setup flow: five skippable steps, saved on the server as they are done. */
export function SetupPage({ search }: { readonly search: SetupSearch }) {
  return (
    <QueryView atom={progressAtom}>
      {(progress) =>
        progress.setup === null ? (
          <FocusLayout exit={exit}>
            <EmptyState icon={ShieldAlert} title="Setup is for admins" description="Ask an owner or admin of your organization to connect tools and decide who can use them." action={<Button asChild><Link to="/">Go to the dashboard</Link></Button>} />
          </FocusLayout>
        ) : (
          <SetupFlow setup={progress.setup} search={search} />
        )}
    </QueryView>
  )
}

function SetupFlow({ setup, search }: { readonly setup: OrgSetup; readonly search: SetupSearch }) {
  const view = viewOf(search.step, setup.steps)
  const controller = useSetup(setup, view)
  return (
    <FocusLayout exit={exit} top={view === "done" ? undefined : <StepIndicator steps={setup.steps} view={view} onSelect={controller.go} />}>
      <SetupStepView key={view} controller={controller} search={search} />
    </FocusLayout>
  )
}

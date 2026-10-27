import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCan } from "@/features/auth/me-context"
import { StepFrame } from "../setup/step-frame"
import type { SetupController } from "../setup/use-setup"
import { AgentConnect } from "./agent-connect"
import { useFirstAgentEvent } from "./agent-activity"
import { FirstCall } from "./first-call"

/** Watches the audit log for the first call; only for people who may read it. */
function LiveFirstCall() {
  return <FirstCall event={useFirstAgentEvent()} />
}

export function AgentStep({ controller }: { readonly controller: SetupController }) {
  const canReadAudit = useCan("audit:read")
  return (
    <StepFrame
      index={4}
      title="Connect your agent"
      description="One endpoint for every client. It signs you in with your work account, so there is no key to paste or rotate."
      onBack={() => controller.go("team")}
      onSkip={() => void controller.finish("skipped")}
      skipping={controller.saving}
      primary={
        <Button onClick={() => void controller.finish("done")} disabled={controller.saving}>
          Finish setup
          <ArrowRight />
        </Button>
      }
    >
      <AgentConnect />
      {canReadAudit && <LiveFirstCall />}
    </StepFrame>
  )
}

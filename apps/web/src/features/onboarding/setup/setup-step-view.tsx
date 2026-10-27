import { AccessStep } from "../access/access-step"
import { AgentStep } from "../agent/agent-step"
import { RuleStep } from "../rule/rule-step"
import { TeamStep } from "../team/team-step"
import { ToolStep } from "../tool/tool-step"
import { DoneStep } from "./done-step"
import type { SetupSearch } from "./setup-search"
import type { SetupController } from "./use-setup"

/** The step on screen. Each one gets the controller to save its outcome and move on. */
export function SetupStepView({ controller, search }: { readonly controller: SetupController; readonly search: SetupSearch }) {
  switch (controller.view) {
    case "tool":
      return <ToolStep controller={controller} search={search} />
    case "access":
      return <AccessStep controller={controller} />
    case "rule":
      return <RuleStep controller={controller} />
    case "team":
      return <TeamStep controller={controller} />
    case "agent":
      return <AgentStep controller={controller} />
    case "done":
      return <DoneStep controller={controller} />
  }
}

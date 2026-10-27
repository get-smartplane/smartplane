import type { IntegrationAction } from "@pc/domain"
import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"

/** What a person deciding on access needs per action: is it agent-shaped, what grant it takes, can it run. */
export function ActionBadges({ action }: { readonly action: IntegrationAction }) {
  const { support } = action
  return (
    <span className="flex flex-wrap items-center gap-1">
      {action.audience === "ai" && (
        <Badge variant="info" title="Flat inputs written for agents, preferred over the classic version.">
          <Sparkles />
          AI-optimised
        </Badge>
      )}
      {action.classification === "destructive" && <Badge variant="destructive">Destructive</Badge>}
      <Badge variant="outline" title={`Needs a ${action.requiredAction} grant`}>
        {action.requiredAction === "use" ? "Use" : "Write"}
      </Badge>
      {support.status === "superseded" && (
        <Badge variant="secondary" title="Hidden so agents get one version of each action.">
          Replaced by <code className="font-mono font-normal">{support.by}</code>
        </Badge>
      )}
      {support.status === "unsupported" && (
        <Badge variant="warning" title={support.reason}>
          Not available
        </Badge>
      )}
    </span>
  )
}

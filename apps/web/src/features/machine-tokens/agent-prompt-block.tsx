import { SetupPlatform, setupPlatformLabels } from "@pc/domain"
import { Schema } from "effect"
import { Bot } from "lucide-react"
import { CopyButton } from "@/components/form/copy-button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { agentEnvLine, dashboardAgentPrompt, type PromptMode } from "./setup-snippets"

const detect = "detect"
const isPlatform = Schema.is(SetupPlatform)

interface Props {
  readonly service: string
  readonly token: string
  readonly deliverUrl: string
  readonly platform: SetupPlatform | undefined
  readonly onPlatform: (platform: SetupPlatform | undefined) => void
  readonly mode: PromptMode
  readonly onMode: (mode: PromptMode) => void
  /** "STRIPE_KEY and DATABASE_URL" */
  readonly reach: string
  readonly expires: string
}

/** The primary path: one prompt for the person's coding agent, whose smartplane skill does the setup. */
export function AgentPromptBlock(props: Props) {
  const prompt = dashboardAgentPrompt(props)
  const paste = props.mode === "paste"
  return (
    <section aria-labelledby="mtk-agent-heading" className="flex min-w-0 flex-col gap-3 rounded-xl bg-primary/6 p-4 ring-1 ring-primary/15">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="mtk-agent-heading" className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4 text-primary" />
          Let your coding agent set it up
        </h3>
        <Select value={props.platform ?? detect} onValueChange={(value) => props.onPlatform(isPlatform(value) ? value : undefined)}>
          <SelectTrigger size="sm" aria-label="Platform" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={detect}>Detect the platform</SelectItem>
            {SetupPlatform.literals.map((platform) => (
              <SelectItem key={platform} value={platform}>{setupPlatformLabels[platform]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
        <p data-testid="agent-prompt" className="min-w-0 flex-1 rounded-lg bg-card px-3 py-2.5 font-mono text-xs leading-relaxed break-words ring-1 ring-border">
          {prompt}
        </p>
        <CopyButton text={prompt} label="Copy prompt" />
      </div>
      {paste ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          This puts the token in your agent's chat. It can only fetch {props.reach}, expires {props.expires}, and you can revoke it any time.
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Set the token in the shell you start your agent from. It can only fetch {props.reach} and expires {props.expires}.
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-3 py-2 text-xs ring-1 ring-border">{agentEnvLine(props.token)}</code>
            <CopyButton text={agentEnvLine(props.token)} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch id="mtk-no-paste" size="sm" checked={!paste} onCheckedChange={(checked) => props.onMode(checked ? "env" : "paste")} />
        <Label htmlFor="mtk-no-paste" className="text-xs font-normal">Without pasting the token</Label>
      </div>
    </section>
  )
}

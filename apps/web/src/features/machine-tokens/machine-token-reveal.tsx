import { type CreatedMachineToken, type Resource, SetupPlatform } from "@pc/domain"
import { Redacted, Schema } from "effect"
import { TriangleAlert } from "lucide-react"
import { useState } from "react"
import { CopyButton } from "@/components/form/copy-button"
import { useQueryData } from "@/components/query/use-query-data"
import { allResourcesAtom } from "@/features/resources/atoms"
import { formatDate } from "@/lib/format"
import { AgentPromptBlock } from "./agent-prompt-block"
import { ManualSetupTabs } from "./manual-setup-tabs"
import { allowedEnvNames, listNames } from "./setup/allowed-env-names"
import { type PromptMode, setupGuides } from "./setup-snippets"

const none: ReadonlyArray<Resource> = []
const isPlatform = Schema.is(SetupPlatform)

/** Shown exactly once, right after creation; closing the dialog discards the plaintext. */
export function MachineTokenReveal({ created }: { readonly created: CreatedMachineToken }) {
  const token = Redacted.value(created.plaintext)
  const resources = useQueryData(allResourcesAtom, none)
  const [platform, setPlatform] = useState<SetupPlatform | undefined>(undefined)
  const [mode, setMode] = useState<PromptMode>("paste")
  const guides = setupGuides(token, created.deliverUrl)
  const [tab, setTab] = useState<string>(guides[0]?.id ?? "railway")

  /** One choice of platform drives both the prompt and the manual tab, whichever the person touched. */
  const choosePlatform = (next: SetupPlatform | undefined) => {
    setPlatform(next)
    if (next !== undefined) setTab(next)
  }
  const chooseTab = (next: string) => {
    setTab(next)
    if (isPlatform(next)) setPlatform(next)
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <AgentPromptBlock
        service={created.token.name}
        token={token}
        deliverUrl={created.deliverUrl}
        platform={platform}
        onPlatform={choosePlatform}
        mode={mode}
        onMode={setMode}
        reach={listNames(allowedEnvNames(created.token.allow, resources))}
        expires={formatDate(created.token.expiresAt)}
      />
      <div className="flex flex-col gap-2 rounded-xl bg-warning/12 p-4 dark:bg-warning/10">
        <p className="flex items-start gap-2 text-sm text-warning-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">Copy this token now.</span> Only a hash is stored; it cannot be shown again.
          </span>
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-card px-3 py-2 text-[0.8125rem] ring-1 ring-border">{token}</code>
          <CopyButton text={token} />
        </div>
      </div>
      <ManualSetupTabs guides={guides} value={tab} onValueChange={chooseTab} />
    </div>
  )
}

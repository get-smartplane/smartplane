import type { CreatedAccessToken } from "@pc/domain"
import { Redacted } from "effect"
import { TriangleAlert } from "lucide-react"
import { CopyButton } from "@/components/form/copy-button"
import { tokenSnippets } from "./mcp-config"
import { SnippetTabs } from "./snippet-tabs"

/** Shown exactly once, right after creation; closing the dialog discards the plaintext. */
export function TokenReveal({ created }: { readonly created: CreatedAccessToken }) {
  const token = Redacted.value(created.plaintext)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl bg-warning/12 p-4 dark:bg-warning/10">
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
      <SnippetTabs snippets={tokenSnippets(created.mcpUrl, token)} />
    </div>
  )
}

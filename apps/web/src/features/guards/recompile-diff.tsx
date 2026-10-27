import type { GuardRecompile } from "@pc/domain"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { wordDiff } from "./word-diff"

/** What the background recompile changed: the previous version's question against this one, word by word. */
export function RecompileDiff({ recompiled, instructions, version }: { readonly recompiled: GuardRecompile; readonly instructions: string; readonly version: number }) {
  const mistakes = recompiled.mistakes === 1 ? "1 call" : `${recompiled.mistakes} calls`
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3.5 text-sm">
      <p className="flex items-start gap-2">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          Recompiled in the background: v{recompiled.fromVersion} misjudged {mistakes}, so v{version} was written with those calls in mind and tested
          better. Still a draft: review the change before activating.
        </span>
      </p>
      <p className="rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap" aria-label={`Changes from v${recompiled.fromVersion}`}>
        {wordDiff(recompiled.previousInstructions, instructions).map((part, index) => (
          <span
            key={index}
            className={cn(part.change === "added" && "rounded-sm bg-success/15 text-success-ink", part.change === "removed" && "rounded-sm bg-destructive/10 text-destructive line-through")}
          >
            {part.text}
          </span>
        ))}
      </p>
    </div>
  )
}

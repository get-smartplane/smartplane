import type { GuardVerifyRun } from "@pc/domain"
import { cn } from "@/lib/utils"
import { useNow } from "./use-now"
import { formatElapsed, runElapsedMs, stepsFor } from "./verify-state"

/**
 * A verify run in a table cell: a short segment per stage and the current stage's name. Several of these
 * update side by side in the rules list, so only colour changes; nothing slides, pulses or spins.
 */
export function VerifyInline({ run }: { readonly run: GuardVerifyRun }) {
  const steps = stepsFor(run)
  const now = useNow(true)
  const current = steps.find((step) => step.state !== "done") ?? steps.at(-1)
  const position = steps.findIndex((step) => step === current) + 1
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex w-24 gap-0.5" aria-hidden="true">
        {steps.map((step) => (
          <span
            key={step.stage}
            className={cn(
              "h-1 flex-1 rounded-full motion-safe:transition-colors motion-safe:duration-200",
              step.state === "done" ? "bg-brand" : step.state === "active" ? "bg-brand/40" : "bg-border"
            )}
          />
        ))}
      </div>
      <p className="flex min-w-0 items-baseline gap-1.5 text-xs">
        <span className="truncate font-medium">{current?.label}</span>
        <span className="sr-only">, stage {position} of {steps.length},</span>
        <span className="shrink-0 text-muted-foreground tabular">{formatElapsed(runElapsedMs(run, now))}</span>
      </p>
    </div>
  )
}

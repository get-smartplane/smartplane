import type { GuardVerifyRun } from "@pc/domain"
import { cn } from "@/lib/utils"
import { useNow } from "./use-now"
import { formatElapsed, runElapsedMs, stepsFor } from "./verify-state"

/**
 * The verify run in one line, for places with little room (setup): a segment per stage that takes the brand
 * colour as it finishes, the current stage's name and the elapsed time. Only colour changes; nothing moves.
 */
export function VerifyCompact({ run }: { readonly run: GuardVerifyRun }) {
  const steps = stepsFor(run)
  const live = steps.some((step) => step.state === "active")
  const now = useNow(live)
  const current = steps.find((step) => step.state !== "done") ?? steps.at(-1)
  const position = steps.findIndex((step) => step === current) + 1
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Verify progress">
      <div className="flex gap-1" aria-hidden="true">
        {steps.map((step) => (
          <span
            key={step.stage}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              step.state === "done" ? "bg-brand" : step.state === "active" ? "bg-brand/40" : step.state === "waiting" ? "bg-warning" : step.state === "failed" ? "bg-destructive" : "bg-border"
            )}
          />
        ))}
      </div>
      <p className="flex items-baseline gap-2 text-sm">
        <span className={cn("font-medium", current?.state === "failed" && "text-destructive")}>
          {run.stage === "done" ? "Verified" : current?.label}
        </span>
        {run.stage !== "done" && <span className="text-xs text-muted-foreground">{position} of {steps.length}</span>}
        <span className="ml-auto text-xs text-muted-foreground tabular">{formatElapsed(runElapsedMs(run, now))}</span>
      </p>
      {run.error !== undefined && run.stage !== "done" && <p className="text-xs text-muted-foreground">{run.error}</p>}
    </div>
  )
}

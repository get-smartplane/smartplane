import type { GuardTestResult } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Violation probability as a bar, with the guard's threshold marked. */
export function TestResult({ result }: { readonly result: GuardTestResult }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Chance this call breaks the rule</span>
        {result.violates ? <StatusBadge tone="danger">Rule triggers</StatusBadge> : <StatusBadge tone="success">Would be allowed</StatusBadge>}
      </div>
      <div className="relative h-2 rounded-full bg-border">
        <div
          className={cn("h-full rounded-full", result.violates ? "bg-destructive" : "bg-success")}
          style={{ width: formatPercent(result.probability) }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground"
          style={{ left: formatPercent(result.threshold) }}
          title={`Threshold ${formatPercent(result.threshold)}`}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatPercent(result.probability)}</span>
        <span>triggers at {formatPercent(result.threshold)}</span>
      </div>
    </div>
  )
}

import type { KeyRewrapResult } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"

/** What one re-wrap batch did, and whether another is needed. */
export function RewrapSummary({ result }: { readonly result: KeyRewrapResult }) {
  const done = result.remaining === 0
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{done ? "Every secret uses the current key" : "More secrets to re-wrap"}</span>
        {done ? <StatusBadge tone="success">Complete</StatusBadge> : <StatusBadge tone="warning">In progress</StatusBadge>}
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Current key</dt>
          <dd className="truncate font-mono text-xs leading-5">{result.kekId}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Re-wrapped now</dt>
          <dd className="font-medium tabular-nums">{result.rewrapped.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Remaining</dt>
          <dd className="font-medium tabular-nums">{result.remaining.toLocaleString()}</dd>
        </div>
      </dl>
      {!done && (
        <p className="text-xs text-muted-foreground">
          Run it again to continue. If the remaining count stops falling, those secrets use a key that is no longer
          configured, and an operator needs to restore it.
        </p>
      )}
    </div>
  )
}

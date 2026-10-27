import { Eye, OctagonX } from "lucide-react"

/** Why the rule starts in monitor mode, and what switching to Block would change. */
export function ModeExplainer() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex gap-3 rounded-lg border border-brand/40 bg-brand/6 p-3.5">
        <Eye className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-semibold">Monitor (starting here).</span> Calls run as usual; any that break the rule are flagged in the audit log.
        </p>
      </div>
      <div className="flex gap-3 rounded-lg border p-3.5">
        <OctagonX className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Block.</span> Calls that break it are stopped before they run. Switch from Rules once the flags look right.
        </p>
      </div>
    </div>
  )
}

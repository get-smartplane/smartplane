import type { ScanOverride } from "@pc/domain"
import { ShieldAlert } from "lucide-react"
import { EntityName } from "@/components/status/entity-name"
import { formatDateTime } from "@/lib/format"

/** Who let this version through despite its scan, and why, as recorded in the audit log. */
export function OverrideNote({ override }: { readonly override: ScanOverride }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/8 px-3.5 py-3 text-sm">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-semibold">Served by override</span>
          <span className="text-muted-foreground">from</span>
          <EntityName entity={{ kind: "user", id: override.by }} className="inline-flex font-medium" />
          <span className="text-muted-foreground">· {formatDateTime(override.at)}</span>
        </span>
        <q className="text-pretty text-muted-foreground">{override.reason}</q>
      </div>
    </div>
  )
}

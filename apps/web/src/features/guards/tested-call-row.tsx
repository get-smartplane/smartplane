import type { GuardTestedCall } from "@pc/domain"
import { X } from "lucide-react"
import { StatusBadge } from "@/components/status/status-badge"
import { Button } from "@/components/ui/button"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import { compactArgs } from "./compact-args"

const sourceLabel = { generated: "generated", draft: "from the draft", custom: "added by you" } as const

/** One tested call: what it is, what should happen, what the classifier did. A mistake is marked, never hidden. */
export function TestedCallRow({ call, onRemove, removing }: { readonly call: GuardTestedCall; readonly onRemove?: () => void; readonly removing?: boolean }) {
  const mistake = call.triggered !== call.violates
  return (
    <li className={cn("grid gap-x-4 gap-y-1.5 px-3.5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]", mistake && "bg-destructive/6")}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <code className="font-mono text-xs font-semibold">{call.tool}</code>
          {call.note && <span className="text-muted-foreground">{call.note}</span>}
        </div>
        <code className="truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(call.arguments, null, 2)}>
          {compactArgs(call.arguments)}
        </code>
        <span className="text-xs text-muted-foreground">{sourceLabel[call.source]}</span>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <span className="text-xs text-muted-foreground">Expected</span>
        {call.violates ? <StatusBadge tone="danger">Breaks it</StatusBadge> : <StatusBadge tone="success">Allowed</StatusBadge>}
        <span className="text-xs text-muted-foreground">Got</span>
        <StatusBadge tone={mistake ? "warning" : call.triggered ? "danger" : "success"}>
          {call.triggered ? "Triggered" : "Allowed"} {formatPercent(call.probability)}
        </StatusBadge>
        {mistake && <span className="text-xs font-semibold text-destructive">Mistake</span>}
        {onRemove && (
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${call.tool} test call`} disabled={removing} onClick={onRemove}>
            <X />
          </Button>
        )}
      </div>
    </li>
  )
}

import type { ChainedAuditEvent } from "@pc/domain"
import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { StatusText } from "@/components/status/status-badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ActorLabel } from "./actor-label"
import { deliverySummary } from "./delivery-detail"
import { denialReasons } from "./denial"
import { eventTitle, eventTone } from "./event-label"
import { TargetLabel } from "./target-label"

export const auditColumnCount = 5

export function AuditRow({ event }: { readonly event: ChainedAuditEvent }) {
  const [open, setOpen] = useState(false)
  const reasons = event.type === "policy.denied" ? denialReasons(event.data) : []
  const summary = deliverySummary(event)
  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(!open)} aria-expanded={open}>
        <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90 text-foreground")} />
            {event.seq}
          </span>
        </TableCell>
        <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{formatDateTime(event.occurredAt)}</TableCell>
        <TableCell className="font-medium">
          <StatusText tone={eventTone(event.type)}>{eventTitle(event)}</StatusText>
          {summary !== undefined && <span className="mt-0.5 block max-w-80 truncate pl-4 text-xs font-normal text-muted-foreground">{summary}</span>}
          {reasons[0] !== undefined && <span className="mt-0.5 block max-w-80 truncate pl-4 text-xs font-normal text-danger-ink" title={reasons.join(" ")}>{reasons[0]}</span>}
          <span className="mt-0.5 flex pl-4 text-xs font-normal text-muted-foreground sm:hidden">
            <ActorLabel actor={event.actor} />
          </span>
        </TableCell>
        <TableCell className="hidden max-w-48 sm:table-cell">
          <ActorLabel actor={event.actor} />
        </TableCell>
        <TableCell className="hidden max-w-56 lg:table-cell">
          <TargetLabel target={event.target} />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={auditColumnCount} className="py-4 whitespace-normal">
            <dl className="grid gap-x-6 gap-y-2 pl-5 text-xs sm:grid-cols-[7rem_1fr]">
              {reasons.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Why blocked</dt>
                  <dd className="flex flex-col gap-0.5 text-sm">{reasons.map((reason, index) => <span key={index}>{reason}</span>)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Actor</dt>
              <dd className="font-mono">{`${event.actor.type}:${event.actor.id}`}</dd>
              <dt className="text-muted-foreground">Target</dt>
              <dd className="font-mono">{event.target ? `${event.target.type}:${event.target.id}` : "—"}</dd>
              <dt className="text-muted-foreground">Request</dt>
              <dd className="font-mono">{event.requestId ?? "—"}</dd>
              <dt className="text-muted-foreground">IP · agent</dt>
              <dd className="font-mono break-all">{[event.ip, event.userAgent].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-muted-foreground">Hash</dt>
              <dd className="font-mono break-all">{event.hash}</dd>
              <dt className="text-muted-foreground">Data</dt>
              <dd>
                <pre className="overflow-auto rounded-lg bg-card p-3 font-mono ring-1 ring-border">{JSON.stringify(event.data, null, 2)}</pre>
              </dd>
            </dl>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

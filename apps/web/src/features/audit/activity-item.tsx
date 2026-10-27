import type { ChainedAuditEvent } from "@pc/domain"
import { StatusText } from "@/components/status/status-badge"
import { formatDateTime, formatRelative } from "@/lib/format"
import { ActorLabel } from "./actor-label"
import { eventTitle, eventTone } from "./event-label"

export function ActivityItem({ event }: { readonly event: ChainedAuditEvent }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]">
      <span className="font-medium">
        <StatusText tone={eventTone(event.type)}>{eventTitle(event)}</StatusText>
      </span>
      <span className="order-3 col-span-2 min-w-0 pl-4 text-muted-foreground sm:order-none sm:col-span-1 sm:pl-0">
        <ActorLabel actor={event.actor} />
      </span>
      <time className="shrink-0 text-xs text-muted-foreground tabular-nums" title={formatDateTime(event.occurredAt)}>
        {formatRelative(event.occurredAt)}
      </time>
    </li>
  )
}

import { StatusText } from "@/components/status/status-badge"
import { EntityName } from "@/components/status/entity-name"
import { ActorLabel } from "@/features/audit/actor-label"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { DecisionEvent } from "./day-buckets"
import { decisionMeta } from "./decision-kind"

/** The last few calls the gateway decided on: outcome, tool and resource, who asked, when. */
export function RecentDecisions({ decisions }: { readonly decisions: ReadonlyArray<DecisionEvent> }) {
  return (
    <ul className="flex flex-col divide-y divide-border/80">
      {decisions.map(({ kind, event, tool, reason }) => (
        <li key={event.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
          <span className="font-medium">
            <StatusText tone={decisionMeta[kind].tone}>{decisionMeta[kind].label}</StatusText>
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5">
            {event.target !== null && (
              <EntityName entity={{ kind: event.target.type, id: event.target.id }} className="shrink-0 font-medium" />
            )}
            {tool !== null && <code className="truncate text-xs text-muted-foreground">{tool}</code>}
          </span>
          <time className="text-xs text-muted-foreground tabular-nums" title={formatDateTime(event.occurredAt)}>
            {formatRelative(event.occurredAt)}
          </time>
          <span />
          <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0"><ActorLabel actor={event.actor} /></span>
            {reason !== null && <span className="truncate text-danger-ink" title={reason}>· {reason}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

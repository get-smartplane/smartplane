import type { DeliverySummary, ResourceId } from "@pc/domain"
import { DateTime } from "effect"
import { useQueryData } from "@/components/query/use-query-data"
import { ActorName } from "@/features/audit/actor-label"
import { formatDateTime, formatRelative } from "@/lib/format"
import { deliveriesAtom } from "./atoms"

const none: ReadonlyArray<DeliverySummary> = []

/** "Delivered 14 times · last by Machine token billing-api, 2 hours ago", from the audit log. Render only with `audit:read`. */
export function DeliveryStats({ resourceId }: { readonly resourceId: ResourceId }) {
  const summary = useQueryData(deliveriesAtom, none).find((row) => row.resourceId === resourceId)
  if (summary === undefined) return <span className="text-xs text-muted-foreground">Not delivered yet</span>
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-xs text-muted-foreground">
      <span className="shrink-0 tabular-nums">
        Delivered {summary.count} {summary.count === 1 ? "time" : "times"} · last by
      </span>
      <span className="min-w-0 max-w-full text-foreground">
        <ActorName actor={summary.lastActor} />
      </span>
      <time className="shrink-0 tabular-nums" dateTime={DateTime.formatIso(summary.lastDeliveredAt)} title={formatDateTime(summary.lastDeliveredAt)}>
        {formatRelative(summary.lastDeliveredAt)}
      </time>
    </span>
  )
}

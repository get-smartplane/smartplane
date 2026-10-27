import { cn } from "@/lib/utils"
import type { DayBucket } from "./day-buckets"
import { decisionKinds, decisionMeta, type DecisionKind } from "./decision-kind"

interface DecisionsLegendProps {
  readonly days: ReadonlyArray<DayBucket>
  readonly capped: (kind: DecisionKind) => boolean
}

/** The week's totals per outcome; doubles as the chart's legend. */
export function DecisionsLegend({ days, capped }: DecisionsLegendProps) {
  return (
    <dl className="grid grid-cols-3 gap-4">
      {decisionKinds.map((kind) => {
        const total = days.reduce((sum, day) => sum + day.counts[kind], 0)
        return (
          <div key={kind} className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
              <span className={cn("size-2.5 rounded-[2px]", decisionMeta[kind].fill)} aria-hidden="true" />
              {decisionMeta[kind].label}
            </dt>
            <dd className="font-display text-2xl leading-8 tabular-nums">
              {total.toLocaleString()}
              {capped(kind) && <span className="text-base text-muted-foreground">+</span>}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

import { cn } from "@/lib/utils"
import type { DayBucket } from "./day-buckets"
import { decisionKinds, decisionMeta } from "./decision-kind"

/**
 * Seven stacked columns, allowed on the baseline, held and blocked above. Each column reveals its
 * counts on hover or focus; the same numbers are in a table for screen readers.
 */
export function DecisionsChart({ days }: { readonly days: ReadonlyArray<DayBucket> }) {
  const max = Math.max(1, ...days.map((day) => day.total))
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative flex h-36 items-end gap-2 border-b border-border sm:gap-3" aria-hidden="true">
        <span className="absolute top-0 left-0 text-[0.6875rem] text-muted-foreground tabular-nums">{max}</span>
        {days.map((day, index) => (
          <div key={day.key} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <div
              className="flex w-full max-w-10 origin-bottom animate-rise flex-col-reverse gap-0.5 overflow-hidden rounded-t-[3px]"
              style={{ height: `${(day.total / max) * 100}%`, animationDelay: `${index * 30}ms` }}
            >
              {decisionKinds.map((kind) =>
                day.counts[kind] === 0 ? null : (
                  <span key={kind} className={cn("min-h-0.5 w-full", decisionMeta[kind].fill)} style={{ flexGrow: day.counts[kind] }} />
                )
              )}
            </div>
            <div className="pointer-events-none invisible absolute bottom-full z-10 mb-1 w-max rounded-md bg-popover px-2.5 py-2 text-xs shadow-[0_8px_24px_-8px_rgb(10_22_48/0.35)] ring-1 ring-border group-hover:visible group-focus-visible:visible">
              <p className="mb-1 font-semibold">{day.label}</p>
              {decisionKinds.map((kind) => (
                <p key={kind} className="flex items-center gap-2 tabular-nums">
                  <span className={cn("size-2 rounded-[2px]", decisionMeta[kind].fill)} />
                  <span className="text-muted-foreground">{decisionMeta[kind].label}</span>
                  <span className="ml-auto pl-3 font-medium">{day.counts[kind]}</span>
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 sm:gap-3" aria-hidden="true">
        {days.map((day) => (
          <span key={day.key} className="flex-1 text-center text-[0.6875rem] text-muted-foreground">
            {day.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Gateway decisions per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            {decisionKinds.map((kind) => (
              <th key={kind}>{decisionMeta[kind].label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.key}>
              <td>{day.label}</td>
              {decisionKinds.map((kind) => (
                <td key={kind}>{day.counts[kind]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

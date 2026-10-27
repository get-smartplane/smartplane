import { cn } from "@/lib/utils"

export interface Segment<V extends string> {
  readonly value: V
  readonly label: string
  readonly count?: number
}

interface SegmentedFilterProps<V extends string> {
  readonly label: string
  readonly segments: ReadonlyArray<Segment<V>>
  readonly value: V
  readonly onChange: (value: V) => void
}

/** A one-row filter with counts: the list's summary and its filter in one control. */
export function SegmentedFilter<V extends string>({ label, segments, value, onChange }: SegmentedFilterProps<V>) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="inline-flex gap-0.5 rounded-md bg-muted p-0.5">
        {segments.map((segment) => (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={segment.value === value}
            onClick={() => onChange(segment.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2.5 text-[0.8125rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              segment.value === value ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {segment.label}
            {segment.count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{segment.count}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

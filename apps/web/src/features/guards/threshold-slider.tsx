import { Slider } from "@/components/ui/slider"
import { formatPercent } from "@/lib/format"

interface ThresholdSliderProps {
  readonly id: string
  readonly value: number
  readonly onChange: (value: number) => void
}

/** Violation probability at or above which the guard triggers. */
export function ThresholdSlider({ id, value, onChange }: ThresholdSliderProps) {
  return (
    <div className="flex items-center gap-4">
      <Slider
        id={id}
        min={0}
        max={1}
        step={0.05}
        value={[value]}
        onValueChange={([next]) => next !== undefined && onChange(next)}
        aria-label="Threshold"
      />
      <span className="w-12 text-right text-sm tabular-nums">{formatPercent(value)}</span>
    </div>
  )
}

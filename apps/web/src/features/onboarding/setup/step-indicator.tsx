import type { SetupStepState, SetupSteps } from "@pc/domain"
import { Check, Minus } from "lucide-react"
import { useRef } from "react"
import { PaperPlane } from "@/components/sky/paper-plane"
import { cn } from "@/lib/utils"
import "../sky/sky.css"
import { indexOf, setupSteps, type SetupView } from "./steps"

const stateWords: { readonly [S in SetupStepState]: string } = { todo: "to do", done: "done", skipped: "skipped" }

/** Waypoints sit at the centre of each fifth; the route humps gently between them, the way the plane hops. */
const route = "M100 38 Q200 16 300 38 Q400 16 500 38 Q600 16 700 38 Q800 16 900 38"
const centre = (index: number) => (index + 0.5) * (100 / setupSteps.length)

interface StepIndicatorProps {
  readonly steps: SetupSteps
  readonly view: SetupView
  readonly onSelect: (view: SetupView) => void
}

/**
 * The steps as a flight: a dotted doodle route with a waypoint per step and the paper plane at the current
 * one. Moving on, the plane glides to the next waypoint on a small arc and leaves speed lines. Each
 * waypoint's label is a button, so any step can be revisited.
 */
export function StepIndicator({ steps, view, onSelect }: StepIndicatorProps) {
  const index = Math.min(indexOf(view), setupSteps.length - 1)
  // Arriving on the page shows the plane at rest; every step it moves to after that is a hop. Keyed by
  // step, so a re-render mid-flight (progress refetching) never restarts or cuts the arc.
  const arrival = useRef(index).current
  const moved = index !== arrival
  return (
    <nav aria-label="Setup steps" className="flex flex-col gap-1">
      <div className="relative h-14 [container-type:inline-size]" aria-hidden="true">
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 1000 56" preserveAspectRatio="none">
          <path d={route} fill="none" className="stroke-foreground/40" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="0 9" vectorEffect="non-scaling-stroke" />
        </svg>
        {setupSteps.map((step, position) => {
          const state = steps[step.id]
          return (
            <span
              key={step.id}
              className={cn(
                "absolute top-[38px] flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-colors duration-200",
                state === "done" ? "border-brand bg-brand" : state === "skipped" ? "border-muted-foreground/50 bg-card" : "border-foreground/50 bg-card"
              )}
              style={{ left: `${centre(position)}%` }}
            />
          )
        })}
        <div className="onb-route-plane absolute top-[9px] left-0 w-11" style={{ transform: `translateX(calc(${centre(index)}cqw - 50%))` }}>
          {moved && (
            <span key={`whoosh-${index}`} className="onb-whoosh absolute top-2 right-full mr-1 flex flex-col items-end gap-1">
              <i className="block h-0.5 w-5 rounded-full bg-foreground/60" />
              <i className="block h-0.5 w-8 rounded-full bg-foreground/60" />
              <i className="block h-0.5 w-4 rounded-full bg-foreground/60" />
            </span>
          )}
          <div key={`plane-${index}`} className={moved ? "onb-hop" : undefined}>
            <PaperPlane className="w-full rotate-6" strokeWidth={5} />
          </div>
        </div>
      </div>
      <ol className="grid grid-cols-5">
        {setupSteps.map(({ id, label }) => {
          const state = steps[id]
          const current = view === id
          return (
            <li key={id} className="flex min-w-0 justify-center">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  current ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {state === "done" && <Check className="size-3.5 shrink-0 text-brand" aria-hidden="true" />}
                {state === "skipped" && <Minus className="size-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate">{label}</span>
                <span className="sr-only">, {stateWords[state]}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

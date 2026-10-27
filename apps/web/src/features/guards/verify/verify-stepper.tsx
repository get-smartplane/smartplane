import type { GuardVerifyRun } from "@pc/domain"
import { Check, Hand, Minus, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { formatElapsed, type StepState, stepsFor, type VerifyStep } from "./verify-state"

/**
 * Remembers whether the component has drawn once: marks only animate when they change afterwards, so a
 * reload or a revisit shows the run as it is without everything settling at once.
 */
const useSettled = () => {
  const drawn = useRef(false)
  useEffect(() => {
    drawn.current = true
  }, [])
  return drawn.current
}

function StepMark({ state, animate }: { readonly state: StepState; readonly animate: boolean }) {
  // Keyed by state: a changed mark is a new element, so `step-in` plays once for it.
  const motion = animate && "animate-step-in"
  switch (state) {
    case "done":
      return <span key={state} className={cn("flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground", motion)}><Check className="size-3" strokeWidth={3} /></span>
    case "active":
      return (
        <span key={state} className={cn("relative flex size-5 items-center justify-center rounded-full ring-[1.5px] ring-brand ring-inset", motion)}>
          {/* A spinner says "working"; with reduced motion it is a still dot. */}
          <span className="size-3 rounded-full border-[1.5px] border-brand border-t-transparent animate-spin motion-reduce:hidden" />
          <span className="hidden size-1.5 rounded-full bg-brand motion-reduce:block" />
        </span>
      )
    case "waiting":
      return <span key={state} className={cn("flex size-5 items-center justify-center rounded-full bg-warning/15 text-warning-ink ring-[1.5px] ring-warning ring-inset", motion)}><Hand className="size-3" /></span>
    case "failed":
      return <span key={state} className={cn("flex size-5 items-center justify-center rounded-full bg-destructive text-white", motion)}><X className="size-3" strokeWidth={3} /></span>
    case "cancelled":
      return <span key={state} className={cn("flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground ring-[1.5px] ring-input ring-inset", motion)}><Minus className="size-3" strokeWidth={3} /></span>
    case "pending":
      return <span key={state} className="flex size-5 items-center justify-center rounded-full ring-[1.5px] ring-input ring-inset"><span className="size-1 rounded-full bg-input" /></span>
  }
}

const timing = (step: VerifyStep, now: number): string | undefined => {
  if (step.tookMs !== undefined && step.stage !== "done") return formatElapsed(step.tookMs)
  if (step.state === "active" && step.startedMs !== undefined) return formatElapsed(now - step.startedMs)
  return undefined
}

/**
 * The verify run as a short vertical list of its stages: done ones checked with how long they took, the
 * running one with its own clock, the rest waiting. Motion is limited to a mark settling when its stage
 * changes and the connector taking the brand colour; reduced motion leaves only the colour change.
 */
export function VerifyStepper({ run, now, detail }: { readonly run: GuardVerifyRun; readonly now: number; readonly detail?: Partial<Record<VerifyStep["stage"], string>> }) {
  const settled = useSettled()
  const steps = stepsFor(run)
  const current = steps.find((step) => step.state === "active" || step.state === "waiting" || step.state === "failed")
  return (
    <>
      <ol className="flex flex-col" aria-label="Verify progress">
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          const time = timing(step, now)
          const note = step.state === "failed" || step.state === "cancelled" ? run.error : detail?.[step.stage]
          return (
            <li
              key={step.stage}
              aria-current={step.state === "active" || step.state === "waiting" ? "step" : undefined}
              className={cn("relative flex gap-3 pb-3 last:pb-0", settled && step.stage === "retrying" && "animate-reveal")}
            >
              {!last && (
                <span aria-hidden="true" className={cn("absolute top-6 bottom-1 left-2.5 w-px -translate-x-1/2 transition-colors duration-200", step.state === "done" ? "bg-brand" : "bg-border")} />
              )}
              <StepMark state={step.state} animate={settled} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-px">
                <div className="flex items-baseline gap-3 text-sm">
                  <span className={cn(step.state === "pending" ? "text-muted-foreground" : "text-foreground", (step.state === "active" || step.state === "waiting") && "font-medium")}>
                    {step.label}
                  </span>
                  {time !== undefined && <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular">{time}</span>}
                </div>
                {note !== undefined && step.state !== "pending" && (
                  <p className={cn("text-xs", step.state === "failed" ? "text-destructive" : "text-muted-foreground")}>{note}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{current?.label ?? (run.stage === "done" ? "Done" : "")}</p>
    </>
  )
}

import { ArrowLeft } from "lucide-react"
import { useEffect, useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { setupSteps } from "./steps"

interface StepFrameProps {
  /** 0-based position, for "Step 2 of 5"; omit on the summary. */
  readonly index?: number
  readonly title: string
  readonly description: ReactNode
  readonly children: ReactNode
  readonly onBack?: (() => void) | undefined
  readonly onSkip?: (() => void) | undefined
  readonly skipLabel?: string
  readonly skipping?: boolean
  /** The step's one primary action, when it lives in the footer (Continue once the step is satisfied). */
  readonly primary?: ReactNode
}

/**
 * One step on screen: where you are, what this step does, its content, then Back, Skip and the one primary
 * action. The heading takes focus on arrival so keyboard and screen-reader users start at the top.
 */
export function StepFrame({ index, title, description, children, onBack, onSkip, skipLabel = "Skip for now", skipping, primary }: StepFrameProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // A new step starts at the top, like a new page; instant, so keyboard users are not kept waiting.
    window.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [title])
  return (
    <section aria-labelledby="setup-step-title" className="flex animate-reveal flex-col gap-8">
      <header className="flex flex-col gap-2">
        {index !== undefined && (
          <p className="text-sm font-medium text-muted-foreground tabular">
            Step {index + 1} of {setupSteps.length}
          </p>
        )}
        <h1 id="setup-step-title" ref={heading} tabIndex={-1} className="font-display text-[2rem] leading-9 outline-none">
          {title}
        </h1>
        <p className="max-w-xl text-[0.9375rem] text-pretty text-muted-foreground">{description}</p>
      </header>
      <div className="flex flex-col gap-6">{children}</div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft />
            Back
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {onSkip && (
            <Button type="button" variant="ghost" onClick={onSkip} disabled={skipping}>
              {skipping && <Spinner />}
              {skipLabel}
            </Button>
          )}
          {primary}
        </div>
      </footer>
    </section>
  )
}

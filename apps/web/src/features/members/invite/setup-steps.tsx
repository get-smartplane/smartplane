import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SetupStep<S extends string> {
  readonly id: S
  readonly label: string
}

interface SetupStepsProps<S extends string> {
  readonly steps: ReadonlyArray<SetupStep<S>>
  readonly current: S
  /** Earlier steps can be revisited; later ones open only through Continue, which checks the current one. */
  readonly onSelect: (step: S) => void
}

/** Where you are in the setup and what is left, by name; finished steps are one click away. */
export function SetupSteps<S extends string>({ steps, current, onSelect }: SetupStepsProps<S>) {
  const at = steps.findIndex((step) => step.id === current)
  return (
    <nav aria-label="Setup steps">
      <ol className="flex gap-1">
        {steps.map((step, index) => {
          const done = index < at
          const here = index === at
          return (
            <li key={step.id} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!done}
                aria-current={here ? "step" : undefined}
                onClick={() => onSelect(step.id)}
                className="group flex w-full flex-col gap-1.5 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
              >
                <span className={cn("h-1 w-full rounded-full", index <= at ? "bg-brand" : "bg-border")} />
                <span
                  className={cn(
                    "flex items-center gap-1 truncate text-xs max-sm:hidden",
                    here ? "font-semibold text-foreground" : done ? "text-muted-foreground group-hover:text-foreground" : "text-muted-foreground/70"
                  )}
                >
                  {done && <Check className="size-3 shrink-0" />}
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="pt-1.5 text-xs sm:hidden">
        <span className="font-semibold">{steps[at]?.label}</span>
        <span className="text-muted-foreground">, {at + 1} of {steps.length}</span>
      </p>
    </nav>
  )
}

import { type Guard, verifyActive } from "@pc/domain"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  readonly label: string
  readonly done: boolean
}

const stepsOf = (guard: Guard): ReadonlyArray<Step> => [
  { label: "Written", done: true },
  verifyActive(guard.verify)
    ? { label: "Verifying…", done: false }
    : { label: guard.compiled ? `Verified · v${guard.compiledVersion}` : "Verify", done: guard.compiled !== null },
  { label: guard.status === "active" ? "Checking calls" : guard.status === "disabled" ? "Switched off" : "Activate", done: guard.status === "active" }
]

/** Where the rule is on its way from a sentence to a live check, and what comes next. */
export function RuleProgress({ guard }: { readonly guard: Guard }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Progress">
      {stepsOf(guard).map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-border" />}
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold",
              step.done ? "bg-brand text-brand-foreground" : "ring-[1.5px] ring-input ring-inset text-muted-foreground"
            )}
          >
            {step.done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
          </span>
          <span className={step.done ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}

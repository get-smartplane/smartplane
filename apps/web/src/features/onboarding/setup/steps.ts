import { SetupStep, type SetupSteps } from "@pc/domain"
import { Schema } from "effect"

/** Where the flow is: one of the five steps, or the summary at the end. */
export const SetupView = Schema.Literals([...SetupStep.literals, "done"])
export type SetupView = typeof SetupView.Type

export const setupSteps: ReadonlyArray<{ readonly id: SetupStep; readonly label: string; readonly title: string }> = [
  { id: "tool", label: "Tool", title: "Connect your first tool" },
  { id: "access", label: "Access", title: "Decide who can use it" },
  { id: "rule", label: "Rule", title: "Add a guard rule" },
  { id: "team", label: "Team", title: "Invite your team" },
  { id: "agent", label: "Agent", title: "Connect your agent" }
]

const decodeView = Schema.decodeUnknownOption(SetupView)

/** The step in the URL when it is a real one; otherwise the first step not yet done or skipped. */
export const viewOf = (requested: string | undefined, steps: SetupSteps): SetupView => {
  const fromUrl = decodeView(requested)
  if (fromUrl._tag === "Some") return fromUrl.value
  return setupSteps.find((step) => steps[step.id] === "todo")?.id ?? "done"
}

export const indexOf = (view: SetupView): number => (view === "done" ? setupSteps.length : setupSteps.findIndex((step) => step.id === view))

/** The view after `view`, in order; the last step leads to the summary. */
export const nextView = (view: SetupView): SetupView => setupSteps[indexOf(view) + 1]?.id ?? "done"

export const previousView = (view: SetupView): SetupView | null => setupSteps[indexOf(view) - 1]?.id ?? null

import type { OrgSetup, SetupStep, SetupStepState, UpdateOrgSetup } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { useMutation } from "@/lib/api/use-mutation"
import { updateSetupAtom } from "../atoms"
import { nextView, type SetupView } from "./steps"

export interface SetupController {
  readonly setup: OrgSetup
  readonly view: SetupView
  readonly saving: boolean
  readonly go: (view: SetupView) => void
  /** Saves fields without leaving the step (e.g. the tool, before an OAuth redirect). */
  readonly save: (patch: UpdateOrgSetup) => Promise<boolean>
  /** Marks the step done or skipped on the server, then moves on. */
  readonly finish: (state: Exclude<SetupStepState, "todo">, patch?: UpdateOrgSetup) => Promise<void>
}

const stepPatch = (step: SetupStep, state: SetupStepState): NonNullable<UpdateOrgSetup["steps"]> => ({ [step]: state })

/** Progress lives on the server; the URL only says which step is on screen, so Back and reload work. */
export const useSetup = (setup: OrgSetup, view: SetupView): SetupController => {
  const navigate = useNavigate()
  const update = useMutation(updateSetupAtom)
  const go = useCallback((next: SetupView) => void navigate({ to: "/setup", search: { step: next } }), [navigate])
  const save = useCallback(async (patch: UpdateOrgSetup) => (await update.execute(patch))._tag === "Success", [update])
  const finish = useCallback(
    async (state: Exclude<SetupStepState, "todo">, patch: UpdateOrgSetup = {}) => {
      if (view === "done") return
      if (await save({ ...patch, steps: stepPatch(view, state) })) go(nextView(view))
    },
    [view, save, go]
  )
  return { setup, view, saving: update.pending, go, save, finish }
}

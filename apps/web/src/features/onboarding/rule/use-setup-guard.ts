import { type Guard, type Resource, verifyActive } from "@pc/domain"
import { useState } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { compileGuardAtom, continueVerifyAtom, createGuardAtom, createGuardFromStarterAtom, guardsAtom, updateGuardAtom } from "@/features/guards/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import type { SetupController } from "../setup/use-setup"
import type { RuleSuggestion } from "./suggestions"

/** New rules start cautious: they flag, never block, until someone switches them to Block from Rules. */
const defaultThreshold = 0.7

/**
 * The rule's lifecycle inside setup: create it (as a draft, saved to the setup so a reload resumes it),
 * start verifying it (a background run the step follows, also across a reload), then switch it on in
 * monitor mode. A suggested rule is prepared on the server: it comes back compiled and verified, so it skips the run. Its name follows the rule's wording. A run that could not start or failed stays on screen.
 */
export const useSetupGuard = (controller: SetupController, tool: Resource | undefined) => {
  const guard = useQueryData(guardsAtom, []).find((candidate) => candidate.id === controller.setup.guardId)
  const create = useMutation(createGuardAtom)
  const createPrepared = useMutation(createGuardFromStarterAtom)
  const compile = useMutation(compileGuardAtom, { quiet: true })
  const skipPin = useMutation(continueVerifyAtom, { quiet: true })
  const update = useMutation(updateGuardAtom, { success: "Rule is on, in monitor mode" })
  const [compileFailed, setCompileFailed] = useState(false)

  const runCompile = async (target: Guard) => {
    setCompileFailed((await compile.execute(target.id))._tag === "Failure")
  }

  const scope = tool === undefined ? [] : [tool.id]

  const createFromSuggestion = async (suggestion: RuleSuggestion) => {
    const created = await createPrepared.execute({ starterId: suggestion.starterId, mode: "monitor", threshold: defaultThreshold, projectId: null, resourceIds: scope })
    if (created._tag === "Success") await controller.save({ guardId: created.value.id })
  }

  const createAndCompile = async (rule: string) => {
    const created = await create.execute({ rule, mode: "monitor", threshold: defaultThreshold, projectId: null, resourceIds: scope })
    if (created._tag === "Failure") return
    if (await controller.save({ guardId: created.value.id })) await runCompile(created.value)
  }

  const activate = async (target: Guard) => {
    const outcome = await update.execute({ id: target.id, payload: { status: "active", mode: "monitor" } })
    if (outcome._tag === "Success") await controller.finish("done", { guardId: target.id })
  }

  return {
    guard,
    compiling: create.pending || createPrepared.pending || compile.pending || verifyActive(guard?.verify),
    compileFailed: compileFailed || guard?.verify?.stage === "failed",
    /** Setup does not pin: a run waiting for that goes on without it (Rules can pin later). */
    skipPin: (target: Guard) => void skipPin.execute(target.id),
    activating: update.pending,
    createFromSuggestion,
    createAndCompile,
    recompile: runCompile,
    activate
  }
}

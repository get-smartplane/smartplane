import type { Atom } from "effect/reactivity"
import { useCallback } from "react"
import { toast } from "sonner"
import type { ApiError } from "@/lib/api/errors"
import type { Outcome } from "@/lib/api/outcome"
import { useMutation } from "@/lib/api/use-mutation"
import { describeSkillError } from "./skill-error"

/** A mutation whose failures are toasted in skill terms ("Choose one skill", "This archive can't be used"). */
export const useSkillMutation = <Arg, A, E extends ApiError>(atom: Atom.AtomResultFn<Arg, A, E>, success?: string) => {
  const { execute, pending } = useMutation(atom, { quiet: true, ...(success === undefined ? {} : { success }) })
  const run = useCallback(
    async (arg: Arg): Promise<Outcome<A, E>> => {
      const outcome = await execute(arg)
      if (outcome._tag === "Failure" && outcome.error._tag !== "Unauthorized") {
        const { title, description } = describeSkillError(outcome.error)
        toast.error(title, { description })
      }
      return outcome
    },
    [execute]
  )
  return { execute: run, pending }
}

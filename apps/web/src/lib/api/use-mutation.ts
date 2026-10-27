import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Atom } from "effect/reactivity"
import { useCallback } from "react"
import { toast } from "sonner"
import { useUnauthorizedRedirect } from "@/features/auth/use-unauthorized-redirect"
import { describeError } from "./describe-error"
import type { ApiError } from "./errors"
import { outcomeOf, type Outcome } from "./outcome"

/**
 * Runs a mutation atom and resolves to a typed outcome. Unauthorized failures redirect;
 * other failures are returned so forms can map them onto fields, and toasted unless `quiet`.
 */
export const useMutation = <Arg, A, E extends ApiError>(
  atom: Atom.AtomResultFn<Arg, A, E>,
  options?: { readonly success?: string; readonly successDetail?: string; readonly quiet?: boolean }
) => {
  const pending = useAtomValue(atom).waiting
  const run = useAtomSet(atom, { mode: "promiseExit" })
  const redirect = useUnauthorizedRedirect()
  const success = options?.success
  const successDetail = options?.successDetail
  const quiet = options?.quiet ?? false

  const execute = useCallback(
    async (arg: Arg): Promise<Outcome<A, E>> => {
      const outcome = outcomeOf(await run(arg))
      if (outcome._tag === "Success") {
        if (success) toast.success(success, successDetail === undefined ? undefined : { description: successDetail })
        return outcome
      }
      if (outcome.error._tag === "Unauthorized") {
        redirect(outcome.error.reason)
      } else if (!quiet) {
        const { title, description } = describeError(outcome.error)
        toast.error(title, { description })
      }
      return outcome
    },
    [run, redirect, success, successDetail, quiet]
  )

  return { execute, pending }
}

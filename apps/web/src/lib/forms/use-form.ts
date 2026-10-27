import type { Schema } from "effect"
import { useCallback, useMemo, useState } from "react"
import type { ApiError } from "@/lib/api/errors"
import type { Outcome } from "@/lib/api/outcome"
import { decodeForm, type FieldErrors } from "./decode-form"

export interface FormMutation<Arg, A, E extends ApiError> {
  readonly execute: (arg: Arg) => Promise<Outcome<A, E>>
  readonly pending: boolean
}

export interface FormController<A> {
  readonly errors: FieldErrors
  readonly pending: boolean
  /** Decodes `input` with the schema, then runs the mutation. Resolves to the result, or undefined on failure. */
  readonly submit: (input: unknown) => Promise<A | undefined>
  readonly reset: () => void
}

const noMessages: Readonly<Record<string, string>> = {}

/**
 * Schema-validated submit: client-side issues and server `InvalidInput { field }` both land in `errors`
 * under the field's path, so the form renders them next to the control.
 */
export const useForm = <S extends Schema.ConstraintDecoder<unknown>, A, E extends ApiError>(
  schema: S,
  mutation: FormMutation<S["Type"], A, E>,
  messages: Readonly<Record<string, string>> = noMessages
): FormController<A> => {
  const [errors, setErrors] = useState<FieldErrors>({})
  const decode = useMemo(() => decodeForm(schema, messages), [schema, messages])
  const { execute, pending } = mutation

  const submit = useCallback(
    async (input: unknown) => {
      const decoded = decode(input)
      if (decoded._tag === "Invalid") {
        setErrors(decoded.errors)
        return undefined
      }
      setErrors({})
      const outcome = await execute(decoded.value)
      if (outcome._tag === "Success") return outcome.value
      const { error } = outcome
      if (error._tag === "InvalidInput" && error.field !== undefined) setErrors({ [error.field]: error.message })
      return undefined
    },
    [decode, execute]
  )

  const reset = useCallback(() => setErrors({}), [])

  return { errors, pending, submit, reset }
}

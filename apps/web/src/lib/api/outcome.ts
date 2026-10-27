import { Cause, Exit, Option } from "effect"
import { TransportFailure, type ApiError } from "./errors"

export type Outcome<A, E extends ApiError> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Failure"; readonly error: E | TransportFailure }

const unexpected = new TransportFailure({ message: "Something unexpected happened. Try again." })

/** The first typed failure in a cause; defects and interruptions surface as a TransportFailure. */
export const errorOf = <E extends ApiError>(cause: Cause.Cause<E>): E | TransportFailure =>
  Option.getOrElse(Cause.findErrorOption(cause), () => unexpected)

export const outcomeOf = <A, E extends ApiError>(exit: Exit.Exit<A, E>): Outcome<A, E> =>
  Exit.isSuccess(exit) ? { _tag: "Success", value: exit.value } : { _tag: "Failure", error: errorOf(exit.cause) }

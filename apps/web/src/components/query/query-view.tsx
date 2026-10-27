import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncResult, type Atom } from "effect/reactivity"
import type { ReactNode } from "react"
import type { ApiError } from "@/lib/api/errors"
import { errorOf } from "@/lib/api/outcome"
import { ErrorState } from "./error-state"
import { LoadingState } from "./loading-state"

interface QueryViewProps<A, E extends ApiError> {
  readonly atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  readonly children: (value: A) => ReactNode
  readonly loading?: ReactNode
}

/** Renders a query atom: skeleton while loading, typed error with retry, or the data (kept while refetching). */
export function QueryView<A, E extends ApiError>({ atom, children, loading }: QueryViewProps<A, E>) {
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  if (AsyncResult.isSuccess(result)) return children(result.value)
  if (AsyncResult.isFailure(result)) return <ErrorState error={errorOf(result.cause)} onRetry={refresh} />
  return loading ?? <LoadingState />
}

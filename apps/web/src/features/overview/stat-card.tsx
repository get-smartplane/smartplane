import { useAtomValue } from "@effect/atom-react"
import { Link, type LinkProps } from "@tanstack/react-router"
import { AsyncResult, type Atom } from "effect/reactivity"
import { Skeleton } from "@/components/ui/skeleton"

interface StatCardProps<A, E> {
  readonly atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  readonly label: string
  readonly to: NonNullable<LinkProps["to"]>
  readonly count: (value: A) => number
  /** A second, quieter fact under the number ("3 invited"). */
  readonly detail?: (value: A) => string
}

/** One cell of the overview strip; shows an em dash when the query fails (e.g. the principal lacks access). */
export function StatCard<A, E>({ atom, label, to, count, detail }: StatCardProps<A, E>) {
  const result = useAtomValue(atom)
  const value = AsyncResult.isSuccess(result) ? result.value : undefined
  return (
    <Link to={to} className="group flex flex-col gap-0.5 bg-card px-4 py-3.5 transition-colors outline-none hover:bg-accent/40 focus-visible:bg-accent/60 md:px-5">
      <span className="text-[0.8125rem] font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
      <span className="font-display text-[1.75rem] leading-9 tabular-nums">
        {value !== undefined ? (
          count(value)
        ) : AsyncResult.isFailure(result) ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Skeleton className="my-1.5 h-6 w-10" />
        )}
      </span>
      <span className="h-4 truncate text-xs text-muted-foreground">{value !== undefined && detail ? detail(value) : null}</span>
    </Link>
  )
}

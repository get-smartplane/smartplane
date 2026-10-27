import type { AuditQuery } from "@pc/domain"
import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { ErrorState } from "@/components/query/error-state"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { errorOf } from "@/lib/api/outcome"
import { auditPageAtom } from "./atoms"
import { AuditRow } from "./audit-row"
import { FullRow } from "./full-row"
import { NewerEventsRow } from "./newer-events-row"

interface AuditPageRowsProps {
  readonly query: AuditQuery
  /** Set on the newest loaded page only: it owns the "check for newer" control. */
  readonly onLoadNewer?: (after: number) => void
  /** Set on the oldest loaded page only: it owns the "load older" control. */
  readonly onLoadOlder?: (before: number) => void
}

/** One cursor page of the log, rendered as table rows. */
export function AuditPageRows({ query, onLoadNewer, onLoadOlder }: AuditPageRowsProps) {
  const atom = auditPageAtom(query)
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)

  if (AsyncResult.isInitial(result)) return <FullRow><Spinner className="mx-auto" /></FullRow>
  if (AsyncResult.isFailure(result)) {
    return (
      <FullRow>
        <div className="text-left">
          <ErrorState error={errorOf(result.cause)} onRetry={refresh} />
        </div>
      </FullRow>
    )
  }
  const { events, nextCursor, prevCursor } = result.value
  const empty = events.length === 0
  // An empty page has nothing newer to stack; asking again re-reads the same cursor.
  const checkNewer = () => (empty || prevCursor === null ? refresh() : onLoadNewer?.(prevCursor))
  return (
    <>
      {onLoadNewer && (
        <NewerEventsRow caughtUp={empty && query.after !== undefined} checking={result.waiting} onCheck={checkNewer} />
      )}
      {events.map((event) => (
        <AuditRow key={event.id} event={event} />
      ))}
      {empty && query.before === undefined && query.after === undefined && (
        <FullRow>
          <span className="text-muted-foreground">No events match these filters.</span>
        </FullRow>
      )}
      {onLoadOlder && nextCursor !== null && (
        <FullRow>
          <Button variant="outline" size="sm" onClick={() => onLoadOlder(nextCursor)}>
            Load older events
          </Button>
        </FullRow>
      )}
    </>
  )
}

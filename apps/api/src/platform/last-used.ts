import { type Cause, DateTime, Duration, Effect } from "effect"

/** Last-used times feed access reviews, which need minutes, not milliseconds: at most one write per token per window. */
export const LastUsedWindow = Duration.minutes(5)

/** `now` and the cutoff before which a stored last-used time is stale, both as stored (ISO-8601 UTC). */
export const lastUsedTimes = Effect.map(DateTime.now, (now) => ({
  now: DateTime.formatIso(now),
  staleBefore: DateTime.formatIso(DateTime.subtractDuration(now, LastUsedWindow))
}))

/** A failed last-used write must never fail the authenticated request it rides on. */
export const bestEffort = (what: string) => <E, R>(write: Effect.Effect<void, E, R>): Effect.Effect<void, never, R> =>
  Effect.catchCause(write, (cause: Cause.Cause<E>) => Effect.logWarning(`${what} failed`, cause))

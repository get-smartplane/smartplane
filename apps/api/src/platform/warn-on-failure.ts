import { Effect, Predicate } from "effect"

const tagOf = (error: unknown): string =>
  Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag) ? error._tag : "unknown"

/**
 * Logs a failure that the next step (usually `Effect.option`) is about to discard. Only the error's tag and
 * the fixed `what` are logged: these failures come from OAuth and token endpoints, whose messages can echo
 * codes, tokens or client secrets.
 */
export const warnOnFailure = (what: string) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.tapError(effect, (error) => Effect.logWarning(what, { error: tagOf(error) }))

import { BindingFailure } from "@pc/domain"
import { Effect } from "effect"

/**
 * Runs a Cloudflare binding call, turning a rejection into a typed `BindingFailure` so each caller decides
 * what it means (a cache miss, a logged warning, or a refusal). Messages come from the platform, never data.
 */
export const bindingCall = <A>(binding: string, operation: string, run: () => Promise<A>): Effect.Effect<A, BindingFailure> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new BindingFailure({ binding, operation, message: cause instanceof Error ? cause.message : String(cause) })
  })

/** For best-effort writes (cache fills and invalidations): a failure is logged, never returned. */
export const logBindingFailure = (what: string) => <R>(effect: Effect.Effect<void, BindingFailure, R>): Effect.Effect<void, never, R> =>
  Effect.catchTag(effect, "BindingFailure", (failure) => warn(what, failure))

/** Logs a binding failure without its cause object, so no request data rides along. */
export const warn = (what: string, failure: BindingFailure) =>
  Effect.logWarning(`${what} failed`, { binding: failure.binding, operation: failure.operation, message: failure.message })

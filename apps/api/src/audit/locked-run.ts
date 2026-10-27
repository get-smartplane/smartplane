import { Cause, Effect, Exit } from "effect"

/** The two DurableObjectState methods the lock needs. */
export interface ObjectLock {
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  waitUntil(promise: Promise<unknown>): void
}

/** The slice of a `Runner` used under the lock: runs an effect, flushing its telemetry through `waitUntil`. */
type RunWith<R> = <A, E>(effect: Effect.Effect<A, E, R>, waitUntil?: (promise: Promise<unknown>) => void) => Promise<A>

/**
 * Runs `program` while the object accepts no other call. A rejection inside `blockConcurrencyWhile` resets the
 * Durable Object, so the outcome is captured as an `Exit` inside and rethrown only outside: a failed batch fails
 * this call alone. Telemetry is flushed through `waitUntil`, after the lock is released.
 */
export const runLocked = async <A, E, R>(lock: ObjectLock, run: RunWith<R>, program: Effect.Effect<A, E, R>): Promise<A> => {
  const exit = await lock.blockConcurrencyWhile(() =>
    run(Effect.exit(program), (flush) => lock.waitUntil(flush)).catch((error: unknown) => Exit.die(error))
  )
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error(`audit append failed: ${Cause.pretty(exit.cause)}`)
}

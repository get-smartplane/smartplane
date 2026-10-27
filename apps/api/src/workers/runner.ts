import { Effect, type Layer, ManagedRuntime } from "effect"
import { AppConfig } from "../platform/config"
import { type Invocation, openInvocation } from "../telemetry/invocation"
import { telemetryLayer } from "../telemetry/otel"

/** One runtime per isolate (or Durable Object instance); telemetry per invocation. */
export interface Runner<R> {
  readonly runtime: ManagedRuntime.ManagedRuntime<R | AppConfig, never>
  readonly open: () => Promise<Invocation>
  /** Runs `effect` with fresh telemetry and flushes it through `waitUntil`, or before resolving without one. */
  readonly run: <A, E>(effect: Effect.Effect<A, E, R | AppConfig>, waitUntil?: (promise: Promise<unknown>) => void) => Promise<A>
}

export const makeRunner = <R>(layer: Layer.Layer<R | AppConfig>, memoMap?: Layer.MemoMap): Runner<R> => {
  const runtime = ManagedRuntime.make(layer, { memoMap })
  const open = async () => openInvocation(telemetryLayer(await runtime.runPromise(AppConfig)))
  const run = async <A, E>(effect: Effect.Effect<A, E, R | AppConfig>, waitUntil?: (promise: Promise<unknown>) => void) => {
    const invocation = await open()
    try {
      return await runtime.runPromise(Effect.provide(effect, invocation.context))
    } finally {
      if (waitUntil) waitUntil(invocation.close())
      else await invocation.close()
    }
  }
  return { runtime, open, run }
}

import { type Context, Effect, Exit, Layer, Scope } from "effect"
import type { OtlpExporter } from "effect/observability"

/** Telemetry services for one Worker invocation, plus the hook that exports what it recorded. */
export interface Invocation {
  readonly context: Context.Context<OtlpExporter.Flusher>
  /** Closes the exporters, which flushes buffered spans and logs. Pass it to `ctx.waitUntil`. */
  readonly close: () => Promise<void>
}

/**
 * Builds the telemetry layer per invocation instead of once per isolate: Workers cancel timers and I/O
 * that outlive the invocation that started them, so a shared exporter would silently drop spans. Each
 * invocation owns its exporter and flushes it before the runtime tears the invocation down.
 */
export const openInvocation = (telemetry: Layer.Layer<OtlpExporter.Flusher>): Promise<Invocation> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(telemetry, scope)
      // Yield once first: the HTTP server span ends just after the response is handed back.
      const close = () => Effect.runPromise(Effect.yieldNow.pipe(Effect.andThen(Scope.close(scope, Exit.void))))
      return { context, close }
    })
  )

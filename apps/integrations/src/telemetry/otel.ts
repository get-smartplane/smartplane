import { type Context, Effect, Exit, Layer, Scope } from "effect"
import { FetchHttpClient } from "effect/http"
import { OtlpExporter, OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/observability"
import type { EnvConfig } from "../platform/env"

/** The Worker's settings and its OTel `service.name` (one per shard, e.g. `smartplane-integrations-business`). */
export interface TelemetryConfig {
  readonly config: EnvConfig
  readonly serviceName: string
}

/** OTLP/HTTP traces and logs when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (same setup as apps/api). */
export const telemetryLayer = ({ config, serviceName }: TelemetryConfig): Layer.Layer<OtlpExporter.Flusher> => {
  const endpoint = config.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, "")
  if (endpoint === undefined || endpoint === "") return OtlpExporter.layerFlusher
  const resource = {
    serviceName,
    serviceVersion: "0.1.0",
    attributes: { "deployment.environment.name": config.ENVIRONMENT, "cloud.provider": "cloudflare", "cloud.platform": "cloudflare_workers" }
  }
  return Layer.mergeAll(
    OtlpTracer.layer({ url: `${endpoint}/v1/traces`, resource }),
    OtlpLogger.layer({ url: `${endpoint}/v1/logs`, resource, mergeWithExisting: true })
  ).pipe(Layer.provide([OtlpSerialization.layerJson, FetchHttpClient.layer]))
}

/**
 * Telemetry is built per invocation: Workers cancel I/O that outlives the invocation that started it, so
 * each run owns its exporter and flushes it (through `waitUntil`) before the runtime tears it down.
 */
export const withTelemetry = async <A>(
  config: TelemetryConfig,
  run: (context: Context.Context<OtlpExporter.Flusher>) => Promise<A>,
  waitUntil: (promise: Promise<unknown>) => void
): Promise<A> => {
  const { context, close } = await buildTelemetry(config)
  try {
    return await run(context)
  } finally {
    waitUntil(close())
  }
}

const buildTelemetry = (config: TelemetryConfig) =>
  Effect.runPromise(Effect.gen(function*() {
    const scope = yield* Scope.make()
    const context = yield* Layer.buildWithScope(telemetryLayer(config), scope)
    const close = () => Effect.runPromise(Effect.yieldNow.pipe(Effect.andThen(Scope.close(scope, Exit.void))))
    return { context, close }
  }))

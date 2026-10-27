import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { OtlpExporter, OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/observability"
import { type EnvConfig, otlpEndpoint } from "../platform/config"

export const ServiceName = "primitive-context-api"

/**
 * OTLP/HTTP traces and logs when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; otherwise only an empty flusher, so
 * the default (non-exporting) tracer stays in place and callers never branch on whether telemetry is on.
 */
export const telemetryLayer = (config: EnvConfig): Layer.Layer<OtlpExporter.Flusher> => {
  const endpoint = otlpEndpoint(config)?.replace(/\/+$/, "")
  if (endpoint === undefined) return OtlpExporter.layerFlusher
  const resource = {
    serviceName: ServiceName,
    serviceVersion: "0.1.0",
    attributes: {
      "deployment.environment.name": config.ENVIRONMENT,
      "cloud.provider": "cloudflare",
      "cloud.platform": "cloudflare_workers"
    }
  }
  return Layer.mergeAll(
    OtlpTracer.layer({ url: `${endpoint}/v1/traces`, resource }),
    OtlpLogger.layer({ url: `${endpoint}/v1/logs`, resource, mergeWithExisting: true })
  ).pipe(Layer.provide([OtlpSerialization.layerJson, FetchHttpClient.layer]))
}

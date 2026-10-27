import { Context, Effect, Layer, Schema } from "effect"

/** Bindings declared in wrangler.jsonc. Only platform layers read these. */
export interface Bindings {
  /** Piece `store` data, keyed per org and integration resource. */
  readonly STORE: KVNamespace
}

export type WorkerEnv = Bindings & Readonly<Record<string, unknown>>

/** wrangler treats an empty var as "set"; an empty OTLP endpoint means "telemetry off". */
export const EnvConfig = Schema.Struct({
  ENVIRONMENT: Schema.NonEmptyString,
  OTEL_EXPORTER_OTLP_ENDPOINT: Schema.optionalKey(Schema.String)
}).annotate({ identifier: "EnvConfig" })
export type EnvConfig = typeof EnvConfig.Type

export class WorkerBindings extends Context.Service<WorkerBindings, Bindings>()("integrations/platform/WorkerBindings") {}

export class AppConfig extends Context.Service<AppConfig, EnvConfig>()("integrations/platform/AppConfig") {
  /** Misconfiguration is a defect: nothing can be served without it. */
  static readonly fromEnv = (env: unknown) => Layer.effect(AppConfig, Effect.orDie(Schema.decodeUnknownEffect(EnvConfig)(env)))
}

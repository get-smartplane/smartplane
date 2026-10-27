import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { AppConfig } from "../platform/config"
import { ServiceName } from "../telemetry/otel"

export const HealthRoute = HttpRouter.add("GET", "/health", AppConfig.useSync((config) =>
  HttpServerResponse.jsonUnsafe({ ok: true, service: ServiceName, environment: config.ENVIRONMENT })).pipe(
    Effect.withSpan("health")
  ))

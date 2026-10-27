import type { IntegrationShard } from "@pc/domain"
import { type PieceLoaders, shardWorkers } from "@pc/integrations/shards"
import { WorkerEntrypoint } from "cloudflare:workers"
import { Effect, ManagedRuntime } from "effect"
import { AppConfig, type WorkerEnv } from "./platform/env"
import { workerServices } from "./platform/layers"
import { handleRun } from "./run/handle"
import { withTelemetry } from "./telemetry/otel"

/**
 * The runner Worker of one shard: runs that shard's curated Activepieces actions for apps/api over a service
 * binding. Every shard is this same code with its own piece registry (`src/shards/<shard>.ts`). It has no
 * public routes (`workers_dev` is off); `fetch` answers only `/health`.
 */
export const integrationsWorker = (shard: IntegrationShard, loaders: PieceLoaders) => {
  const service = shardWorkers[shard].service
  /** Built on first use, not at module scope: Workers forbid I/O and randomness during global evaluation. */
  const makeRuntime = (env: WorkerEnv) => ManagedRuntime.make(workerServices(env, shard, loaders))
  let runtime: ReturnType<typeof makeRuntime> | undefined

  return class IntegrationsWorker extends WorkerEntrypoint<WorkerEnv> {
    override async fetch(request: Request): Promise<Response> {
      if (new URL(request.url).pathname !== "/health") return new Response("Not found", { status: 404 })
      return Response.json({ ok: true, service, shard })
    }

    /** RPC: a JSON-encoded `RunRequest` in, a JSON-encoded `RunResponse` out. */
    async run(request: unknown): Promise<unknown> {
      const app = (runtime ??= makeRuntime(this.env))
      const config = await app.runPromise(AppConfig)
      return withTelemetry(
        { config, serviceName: service },
        (telemetry) => app.runPromise(Effect.provide(handleRun(request), telemetry)),
        (promise) => this.ctx.waitUntil(promise)
      )
    }
  }
}

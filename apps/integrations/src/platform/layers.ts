import type { IntegrationShard } from "@pc/domain"
import type { PieceLoaders } from "@pc/integrations/shards"
import { Layer } from "effect"
import { CatalogIndex } from "../run/catalog-index"
import { PieceLoader } from "../run/piece-loader"
import { PieceRunner } from "../run/runner"
import { ActionStore } from "../run/store"
import { AppConfig, WorkerBindings, type WorkerEnv } from "./env"

/** Every service of a shard's Worker, built once per isolate. */
export const workerServices = (env: WorkerEnv, shard: IntegrationShard, loaders: PieceLoaders) =>
  PieceRunner.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(CatalogIndex.forShard(shard), PieceLoader.make(loaders), ActionStore.layer)),
    Layer.provideMerge(Layer.mergeAll(Layer.succeed(WorkerBindings, env), AppConfig.fromEnv(env)))
  )

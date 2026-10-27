import type { IntegrationShard } from "@pc/domain"
import type { IntegrationsRpc } from "@pc/integrations/rpc"
import { shardWorkers } from "@pc/integrations/shards"
import { Option } from "effect"
import type { Bindings } from "../platform/bindings"

/** Each shard's runner Worker, or `undefined` where this deployment does not bind it. */
export type ShardRunners = { readonly [S in IntegrationShard]: IntegrationsRpc | undefined }

/** The service bindings by the names `shardWorkers` gives them (wrangler.jsonc `services`). */
export const shardRunners = (bindings: Pick<Bindings, (typeof shardWorkers)[IntegrationShard]["binding"]>): ShardRunners => ({
  core: bindings[shardWorkers.core.binding],
  business: bindings[shardWorkers.business.binding]
})

export interface ShardRoute {
  readonly shard: IntegrationShard
  readonly runner: IntegrationsRpc
}

/** Where a piece runs: the catalog records its shard, the bindings name that shard's Worker. */
export const routeToShard = (runners: ShardRunners, shardOf: (pieceId: string) => Option.Option<IntegrationShard>) =>
(pieceId: string): ShardRoute | undefined =>
  Option.getOrUndefined(Option.flatMap(shardOf(pieceId), (shard) => Option.map(Option.fromUndefinedOr(runners[shard]), (runner) => ({ shard, runner }))))

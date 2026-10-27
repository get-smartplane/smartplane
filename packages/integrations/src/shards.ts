import type { IntegrationShard } from "@pc/domain"

/**
 * The runner Worker of each shard and the apps/api service binding that reaches it. Every shard runs the
 * same code (apps/integrations) with its own generated piece registry, so a bundle holds only its pieces.
 */
export const shardWorkers = {
  core: { service: "smartplane-integrations", binding: "INTEGRATIONS" },
  business: { service: "smartplane-integrations-business", binding: "INTEGRATIONS_BUSINESS" }
} as const satisfies { readonly [S in IntegrationShard]: { readonly service: string; readonly binding: string } }

export const shards: ReadonlyArray<IntegrationShard> = ["core", "business"]

/** A shard's lazy piece loaders, by piece id (generated into `generated/pieces/<shard>.ts`). */
export type PieceLoaders = Readonly<Record<string, () => Promise<unknown>>>

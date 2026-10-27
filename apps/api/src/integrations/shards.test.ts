import { assert, describe, it } from "@effect/vitest"
import { OrgId, PieceId, ResourceId } from "@pc/domain"
import { type IntegrationsRpc, type RunRequest, RunRequestJson, RunResponseJson } from "@pc/integrations/rpc"
import { Effect, Option, Schema } from "effect"
import { IntegrationCatalog } from "./catalog"
import { IntegrationRunner } from "./runner"
import { routeToShard, shardRunners } from "./shards"

/** A runner Worker that records what it received and answers every run with `{ shard }`. */
const worker = (shard: string, seen: Array<unknown>): IntegrationsRpc => ({
  run: async (request) => {
    seen.push(Schema.decodeUnknownSync(RunRequestJson)(request).pieceId)
    return Schema.encodeSync(RunResponseJson)({ ok: true, result: { output: { shard }, truncated: false, ms: 1 } })
  }
})

const runOf = (pieceId: string): RunRequest => ({
  orgId: OrgId.make("org_testorg01"),
  resourceId: ResourceId.make("res_integrat01"),
  pieceId: PieceId.make(pieceId),
  actionName: "act",
  auth: { type: "none" },
  props: {}
})

/** The real catalog's shard for each piece, as `IntegrationRunner.layer` reads it. */
const catalogShards = Effect.gen(function*() {
  const catalog = yield* IntegrationCatalog
  return (pieceId: string) => Option.map(catalog.piece(pieceId), (piece) => piece.shard)
})

describe("integration shards", () => {
  it("maps each shard to its service binding by name", () => {
    const core = worker("core", [])
    const business = worker("business", [])
    assert.deepStrictEqual(shardRunners({ INTEGRATIONS: core, INTEGRATIONS_BUSINESS: business }), { core, business })
    assert.deepStrictEqual(shardRunners({}), { core: undefined, business: undefined })
  })

  it.effect("sends each run to the Worker of its piece's shard", () =>
    Effect.gen(function*() {
      const seen = { core: [] as Array<unknown>, business: [] as Array<unknown> }
      const runner = IntegrationRunner.make(routeToShard({ core: worker("core", seen.core), business: worker("business", seen.business) }, yield* catalogShards))
      const outputs = yield* Effect.forEach(["github", "microsoft-outlook", "netsuite", "salesforce", "http"], (pieceId) => runner.run(runOf(pieceId)))
      assert.deepStrictEqual(outputs.map((result) => result.output), [{ shard: "core" }, { shard: "business" }, { shard: "business" }, { shard: "business" }, { shard: "core" }])
      assert.deepStrictEqual(seen, { core: ["github", "http"], business: ["microsoft-outlook", "netsuite", "salesforce"] })
    }).pipe(Effect.provide(IntegrationCatalog.layer)))

  it.effect("serves nothing for a shard without a binding, or a piece the catalog does not know", () =>
    Effect.gen(function*() {
      const runner = IntegrationRunner.make(routeToShard({ core: worker("core", []), business: undefined }, yield* catalogShards))
      assert.deepStrictEqual(["github", "microsoft-teams", "myspace"].map(runner.serves), [true, false, false])
      const failure = yield* Effect.flip(runner.run(runOf("microsoft-teams")))
      assert.deepInclude(failure, { _tag: "UpstreamFailure", message: "the integrations service is not configured" })
    }).pipe(Effect.provide(IntegrationCatalog.layer)))
})

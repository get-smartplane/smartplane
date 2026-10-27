import { assert, describe, it } from "@effect/vitest"
import { ResourceId } from "@pc/domain"
import { DateTime, Effect, Layer, Option } from "effect"
import { actorOf } from "../audit/actor"
import { ResourcesRepo } from "../resources/resources-repo"
import { noConnections } from "../testing/connection-fakes"
import { TestDatabase } from "../testing/database"
import { now, orgId, userId, userPrincipal } from "../testing/fixtures"
import { fakeSecrets, memoryKv } from "../testing/gateway-fakes"
import { insertRow, seedOrg } from "../testing/seed"
import { textResult } from "./sdk"
import { Upstream } from "./upstream"
import { UpstreamClient } from "./upstream-client"

const id = ResourceId.make("res_legacymcp1")
const secretId = ResourceId.make("res_legacysec1")

describe("MCP servers stored before auth was a union", () => {
  it.effect("a row with `authSecretId` still decodes and still sends its bearer token", () => {
    const headers: Array<Readonly<Record<string, string>>> = []
    const client = Layer.succeed(UpstreamClient, {
      listTools: () => Effect.succeed([]),
      callTool: (target) => Effect.sync(() => (headers.push(target.headers), textResult("ok")))
    })
    return Effect.gen(function*() {
      yield* seedOrg
      yield* insertRow("resources", {
        id, orgId, kind: "mcp_server", name: "Legacy", description: "", createdBy: userId, createdAt: DateTime.formatIso(now),
        config: JSON.stringify({ kind: "mcp_server", url: "https://legacy.example.com/mcp", transport: "streamable_http", authSecretId: secretId })
      })
      const server = Option.getOrThrow(yield* ResourcesRepo.use((repo) => repo.find(orgId, id)))
      assert.deepStrictEqual(server.config.kind === "mcp_server" ? server.config.auth : null, { type: "secret", secretId })
      const principal = userPrincipal()
      yield* Upstream.use((upstream) => upstream.callTool(server, { principal, actor: actorOf(principal) }, "ping", {}))
      assert.deepStrictEqual(headers, [{ authorization: "Bearer legacy-token" }])
      // Saving it again writes the new shape.
      yield* ResourcesRepo.use((repo) => repo.update(server))
      const raw = yield* ResourcesRepo.use((repo) => repo.find(orgId, id))
      assert.deepStrictEqual(Option.map(raw, (found) => found.config), Option.some(server.config))
    }).pipe(Effect.provide(Layer.mergeAll(
      ResourcesRepo.layer,
      Upstream.layer.pipe(Layer.provide([client, fakeSecrets({ [secretId]: "legacy-token" }), memoryKv(), noConnections]))
    ).pipe(Layer.provideMerge(TestDatabase))))
  })
})

import { assert, describe, it } from "@effect/vitest"
import { UpstreamFailure } from "@pc/domain"
import { Effect, Layer } from "effect"
import { actorOf } from "../audit/actor"
import { Upstream } from "../mcp/upstream"
import { textResult } from "../mcp/sdk"
import { ResourcesRepo } from "../resources/resources-repo"
import { noConnections } from "../testing/connection-fakes"
import { userPrincipal } from "../testing/fixtures"
import { accessOf, grantOf, resourceOf } from "../testing/gateway-fakes"
import { makeUpstreamMcpProvider } from "./upstream-mcp"

const activepieces = resourceOf("res_activepcs1", "Activepieces", { kind: "mcp_server", url: "https://ap.example.com/mcp", transport: "streamable_http" })
const unused = () => Effect.die("not used by the provider")

const layer = (calls: Array<unknown>) =>
  Layer.mergeAll(
    Layer.succeed(Upstream, {
      listTools: () => Effect.succeed([{ name: "ap_run_action", inputSchema: { type: "object" } }]),
      callTool: (_server, _caller, _tool, args) => Effect.sync(() => (calls.push(args), textResult("ran")))
    }),
    noConnections,
    Layer.succeed(ResourcesRepo, { list: unused, find: unused, findMany: () => Effect.succeed([]), ofKind: unused, insert: unused, update: unused, remove: unused, switchAccountMode: unused })
  )

describe("upstream MCP tools with argument constraints", () => {
  it.effect("lets a generic `ap_run_action` run only for the pieces the grant names", () => {
    const calls: Array<unknown> = []
    return Effect.gen(function*() {
      const principal = userPrincipal()
      const grant = grantOf(activepieces, "use", { tools: ["ap_run_action"], arguments: { ap_run_action: { pieceName: ["slack"] } } })
      const [tool] = yield* (yield* makeUpstreamMcpProvider).tools({ principal, actor: actorOf(principal), access: accessOf(grant) })
      if (tool === undefined) return yield* Effect.die("expected activepieces__ap_run_action")
      assert.strictEqual(tool.definition.name, "activepieces__ap_run_action")
      const denied = yield* Effect.flip(tool.prepare({ pieceName: "github", actionName: "delete_repo" }))
      assert.deepStrictEqual(denied._tag === "PolicyDenied" ? denied.reasons : [], [
        { _tag: "ArgumentNotAllowed", resourceId: activepieces.id, tool: "ap_run_action", path: "pieceName" }
      ])
      yield* Effect.flatMap(tool.prepare({ pieceName: "slack", actionName: "send_message" }), (call) => call.execute)
      assert.deepStrictEqual(calls, [{ pieceName: "slack", actionName: "send_message" }])
    }).pipe(Effect.provide(layer(calls)))
  })
})

describe("upstream MCP servers whose tools cannot be listed", () => {
  it.effect("show one `<server>__unavailable` tool with the reason instead of vanishing", () => {
    const failing = Layer.mergeAll(
      Layer.succeed(Upstream, {
        listTools: () => Effect.fail(new UpstreamFailure({ upstream: "Activepieces", message: "upstream answered 401" })),
        callTool: unused
      }),
      noConnections,
      Layer.succeed(ResourcesRepo, { list: unused, find: unused, findMany: () => Effect.succeed([]), ofKind: unused, insert: unused, update: unused, remove: unused, switchAccountMode: unused })
    )
    return Effect.gen(function*() {
      const principal = userPrincipal()
      const tools = yield* (yield* makeUpstreamMcpProvider).tools({ principal, actor: actorOf(principal), access: accessOf(grantOf(activepieces, "use")) })
      assert.deepStrictEqual(tools.map((tool) => tool.definition.name), ["activepieces__unavailable"])
      assert.include(tools[0]?.definition.description ?? "", "upstream answered 401")
      const failure = yield* Effect.flip(Effect.flatMap(tools[0]!.prepare({}), (call) => call.execute))
      assert.strictEqual(failure.message, "upstream answered 401")
    }).pipe(Effect.provide(failing))
  })
})

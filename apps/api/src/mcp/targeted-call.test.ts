import { assert, describe, it } from "@effect/vitest"
import type { Resource } from "@pc/domain"
import { Effect, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { AccessPolicy } from "../access/access-policy"
import { actorOf } from "../audit/actor"
import { makeUpstreamMcpProvider } from "../gateway-tools/upstream-mcp"
import { ResourcesRepo } from "../resources/resources-repo"
import { noConnections } from "../testing/connection-fakes"
import { userPrincipal } from "../testing/fixtures"
import { accessOf, allowAll, fakeGuards, fakeSecrets, grantOf, memoryKv, memoryPinChildren, type Recorded, recordingAudit, resourceOf } from "../testing/gateway-fakes"
import { ToolCatalog } from "./catalog"
import { McpGateway } from "./gateway"
import { ToolPipeline } from "./pipeline"
import { type ToolProvider, ToolProviders } from "./provider"
import { textResult } from "./sdk"
import { CallToolName } from "./search/meta-tools"
import { ToolSearchSettings } from "./search/mode"
import { Upstream } from "./upstream"
import { UpstreamClient } from "./upstream-client"

const server = (id: string, name: string) => resourceOf(id, name, { kind: "mcp_server", url: `https://${name.toLowerCase()}.example.com/mcp`, transport: "streamable_http" })
const alpha = server("res_alphasrv1", "Alpha")
const beta = server("res_betasrv01", "Beta")
const principal = userPrincipal()
const unused = () => Effect.die("not used")
const repo = Layer.succeed(ResourcesRepo, { list: unused, find: unused, findMany: () => Effect.succeed([]), ofKind: unused, insert: unused, update: unused, remove: unused, switchAccountMode: unused })

/** The real upstream provider over servers that list one `ping` tool each, recording which servers were listed. */
const catalogOver = (listed: Array<string>) => {
  const upstream = Layer.succeed(Upstream, {
    listTools: (target: Resource) => Effect.sync(() => (listed.push(target.name), [{ name: "ping", inputSchema: { type: "object" } }])),
    callTool: () => Effect.succeed(textResult("pong"))
  })
  const providers = Layer.effect(ToolProviders, Effect.map(makeUpstreamMcpProvider, (provider): ReadonlyArray<ToolProvider> => [provider]))
  return ToolCatalog.layer.pipe(Layer.provide([
    providers.pipe(Layer.provide(Layer.mergeAll(upstream, noConnections, repo))),
    Layer.succeed(AccessPolicy, { resolve: () => Effect.succeed(accessOf(grantOf(alpha, "use"), grantOf(beta, "use"))) })
  ]))
}

const gatewayOver = (listed: Array<string>, events: Array<Recorded>) =>
  McpGateway.layer.pipe(
    Layer.provide(Layer.mergeAll(catalogOver(listed), ToolPipeline.layer.pipe(Layer.provide(memoryPinChildren())), ToolSearchSettings.fixed(null))),
    Layer.provide([fakeGuards(allowAll, []), recordingAudit(events)])
  )

const call = (name: string, args: Record<string, unknown> = {}) => McpGateway.use((gateway) => gateway.callTool(principal, name, args))

describe("tools/call resolves only the server the tool name points at", () => {
  it.effect("a call, direct or through call_tool, lists only its own server", () => {
    const listed: Array<string> = []
    return Effect.gen(function*() {
      assert.isFalse((yield* call("beta__ping")).isError)
      assert.deepStrictEqual(listed, ["Beta"])
      assert.isFalse((yield* call(CallToolName, { name: "alpha__ping" })).isError)
      assert.deepStrictEqual(listed, ["Beta", "Alpha"])
    }).pipe(Effect.provide(gatewayOver(listed, [])))
  })

  it.effect("an unknown tool in a known namespace suggests from that namespace; an unknown namespace searches everything", () => {
    const listed: Array<string> = []
    const events: Array<Recorded> = []
    return Effect.gen(function*() {
      const near = yield* call("beta__pnig")
      assert.include(String(near.content[0]?.text), "beta__ping")
      assert.deepStrictEqual(listed, ["Beta"])
      const far = yield* call("betta__ping")
      assert.include(String(far.content[0]?.text), "Did you mean")
      assert.sameMembers(listed.slice(1), ["Alpha", "Beta"])
      assert.deepStrictEqual(events.map((event) => event.type), ["policy.denied", "policy.denied"])
    }).pipe(Effect.provide(gatewayOver(listed, events)))
  })

  it.effect("the built-ins' namespace lists no upstream server", () => {
    const listed: Array<string> = []
    return Effect.gen(function*() {
      const catalog = yield* ToolCatalog.use((tools) => tools.forTool(principal, "skills_list"))
      assert.deepStrictEqual([catalog.size, listed], [0, []])
    }).pipe(Effect.provide(catalogOver(listed)))
  })
})

describe("upstream tool listing has a short timeout", () => {
  it.effect("a server that does not answer within 10 s becomes `<server>__unavailable`", () => {
    const hanging = Layer.succeed(UpstreamClient, { listTools: () => Effect.never, callTool: () => Effect.never })
    const layer = Upstream.layer.pipe(Layer.provide(Layer.mergeAll(hanging, noConnections, memoryKv(), fakeSecrets({}))))
    return Effect.gen(function*() {
      const provider = yield* makeUpstreamMcpProvider
      const fiber = yield* Effect.forkChild(provider.tools({ principal, actor: actorOf(principal), access: accessOf(grantOf(alpha, "use")) }))
      yield* TestClock.adjust("10 seconds")
      const tools = yield* Fiber.join(fiber)
      assert.deepStrictEqual(tools.map((tool) => tool.definition.name), ["alpha__unavailable"])
      assert.include(tools[0]?.definition.description ?? "", "did not list its tools in time")
    }).pipe(Effect.provide(Layer.mergeAll(layer, noConnections, repo)))
  })
})

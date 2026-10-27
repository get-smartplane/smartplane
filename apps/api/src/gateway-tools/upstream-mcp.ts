import { type AccountNotConnected, PolicyDenied, type Principal, type Resource, UpstreamFailure } from "@pc/domain"
import { Effect } from "effect"
import { type EffectiveAccess, toolDenials } from "../access/resolution"
import { ConnectionResolver } from "../connections/resolver"
import type { CallerScope, GatewayTool, ToolProvider } from "../mcp/provider"
import { describe, toolName } from "../mcp/naming"
import { Upstream } from "../mcp/upstream"
import { ResourcesRepo } from "../resources/resources-repo"

/** MCP servers the principal can reach: granted directly, or through a granted single-tool resource. */
const reachableServers = (repo: ResourcesRepo["Service"], principal: Principal, access: EffectiveAccess) =>
  Effect.gen(function*() {
    const granted = Array.from(access.values(), ({ resource }) => resource)
    const viaTools = granted.flatMap((resource) => (resource.config.kind === "tool" ? [resource.config.serverId] : []))
    const direct = granted.filter((resource) => resource.config.kind === "mcp_server")
    const missing = viaTools.filter((id) => !direct.some((server) => server.id === id))
    const extra = yield* repo.findMany(principal.orgId, [...new Set(missing)])
    return [...direct, ...extra].filter((server) => principal.projectId === null || server.projectId === null || server.projectId === principal.projectId)
  })

/**
 * Stands in for a server whose tools cannot be listed because the caller's account (or the shared one) is not
 * connected: calling it answers with the "connect your account" error and link, through the usual pipeline.
 */
const connectTool = (server: Resource, notConnected: AccountNotConnected): GatewayTool => ({
  definition: {
    name: toolName(server, "connect_account"),
    description: describe(server, `Not connected yet: connect the account at ${notConnected.connectUrl} to use this server's tools.`),
    inputSchema: { type: "object", properties: {} }
  },
  target: server,
  operation: "connect_account",
  prepare: () => Effect.fail(notConnected)
})

/** Stands in for a granted server whose tools could not be listed; calling it repeats the reason. */
const unavailableTool = (server: Resource, reason: string): GatewayTool => ({
  definition: {
    name: toolName(server, "unavailable"),
    description: describe(server, `Unavailable right now: ${reason}. Ask an admin to check its connection in Smartplane.`),
    inputSchema: { type: "object", properties: {} }
  },
  target: server,
  operation: "unavailable",
  prepare: (args) => Effect.succeed({ arguments: args, execute: Effect.fail(new UpstreamFailure({ upstream: server.name, message: reason })) })
})

/** Customer MCP servers, with upstream tool names namespaced `<server-slug>__<tool>`. Unreachable servers only hide their own tools. */
export const makeUpstreamMcpProvider = Effect.gen(function*() {
  const upstream = yield* Upstream
  const repo = yield* ResourcesRepo
  const resolver = yield* ConnectionResolver

  const serverTools = ({ principal, actor, access }: CallerScope, server: Resource) =>
    Effect.gen(function*() {
      const caller = { principal, actor }
      const connected = yield* Effect.result(resolver.context(server, principal))
      if (connected._tag === "Failure") return [connectTool(server, connected.failure)]
      const connection = connected.success
      const tools = yield* upstream.listTools(server, caller)
      return tools.filter((tool) => toolDenials(access, server.id, tool.name).length === 0).map((tool): GatewayTool => ({
        definition: { ...tool, name: toolName(server, tool.name), description: describe(server, tool.description ?? "") },
        target: server,
        operation: tool.name,
        prepare: (args) => {
          // Argument constraints let a generic upstream tool (e.g. Activepieces' `ap_run_action`) be granted per target.
          const [denied, ...more] = toolDenials(access, server.id, tool.name, args)
          return denied === undefined
            ? Effect.succeed({ arguments: args, connection, execute: upstream.callTool(server, caller, tool.name, args) })
            : Effect.fail(new PolicyDenied({ reasons: [denied, ...more] }))
        }
      }))
    }).pipe(
      // Hiding the server would leave the agent (and the person) with no clue why its tools vanished.
      Effect.catchTag("UpstreamFailure", (failure) =>
        Effect.as(Effect.logWarning("upstream tool listing failed", failure.message), [unavailableTool(server, failure.message)]))
    )

  const provider: ToolProvider = {
    source: "mcp",
    tools: (scope) =>
      Effect.flatMap(reachableServers(repo, scope.principal, scope.access), (servers) =>
        Effect.map(Effect.forEach(servers, (server) => serverTools(scope, server), { concurrency: 8 }), (lists) => lists.flat()))
  }
  return provider
})

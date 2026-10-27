import { accountModeOf, type Actor, type McpServerConfig, type Principal, type Resource, UpstreamFailure } from "@pc/domain"
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { ConnectionResolver } from "../connections/resolver"
import { KvCache } from "../platform/kv"
import { Secrets } from "../secrets/secrets"
import { upstreamToolsKey, upstreamUserToolsKey } from "./cache-keys"
import { McpTool, type ToolResult, type UpstreamTarget } from "./sdk"
import { type UpstreamCallFailed, UpstreamClient, type UpstreamUnauthorized } from "./upstream-client"

const ToolListTtlSeconds = 300
const CachedTools = Schema.Array(McpTool)

/** Who is calling: per-user servers use the caller's own account, and every credential read is audited as them. */
export interface UpstreamCaller {
  readonly principal: Principal
  readonly actor: Actor
}

/** Per-user servers may list different tools per account, so each caller's listing is cached apart. */
const cacheKey = (server: Resource, caller: UpstreamCaller) =>
  accountModeOf(server.config) === "per_user" && caller.principal._tag === "User"
    ? upstreamUserToolsKey(server.id, caller.principal.userId)
    : upstreamToolsKey(server.id)

/**
 * Talks to customer MCP servers. Credentials are injected here (a shared secret, the caller's own token, or
 * OAuth tokens of the shared or the caller's connection) and never reach the agent. An OAuth server that
 * answers 401 gets one retry with freshly refreshed tokens.
 */
export class Upstream extends Context.Service<Upstream, {
  readonly listTools: (server: Resource, caller: UpstreamCaller) => Effect.Effect<ReadonlyArray<McpTool>, UpstreamFailure>
  readonly callTool: (server: Resource, caller: UpstreamCaller, tool: string, args: Readonly<Record<string, unknown>>) => Effect.Effect<ToolResult, UpstreamFailure>
}>()("api/mcp/Upstream") {
  static readonly layer = Layer.effect(
    Upstream,
    Effect.gen(function*() {
      const secrets = yield* Secrets
      const cache = yield* KvCache
      const resolver = yield* ConnectionResolver
      const client = yield* UpstreamClient

      const failure = (server: Resource, message: string) => new UpstreamFailure({ upstream: server.name, message })

      const credential = (server: Resource, config: McpServerConfig, caller: UpstreamCaller, force: boolean) =>
        Effect.gen(function*() {
          const auth = config.auth
          if (auth === undefined || auth.type === "none") return Option.none<string>()
          if (auth.type === "secret" && auth.secretId !== undefined && accountModeOf(config) === "shared") {
            const value = yield* secrets.reveal(server.orgId, auth.secretId, "upstream_auth", caller.actor).pipe(
              Effect.mapError(() => failure(server, "the server's credential is missing"))
            )
            return Option.some(Redacted.value(value))
          }
          const stored = yield* resolver.credential(server, caller.principal, caller.actor, force).pipe(
            Effect.catchTag("AccountNotConnected", () => Effect.fail(failure(server, "the account is not connected")))
          )
          return Option.some(stored.type === "oauth" ? stored.tokens.accessToken : stored.value)
        })

      const target = Effect.fn("Upstream.target")(function*(server: Resource, caller: UpstreamCaller, force: boolean): Effect.fn.Return<UpstreamTarget, UpstreamFailure> {
        const config = server.config
        if (config.kind !== "mcp_server") return yield* Effect.die(new Error(`${server.id} is not an MCP server`))
        const value = yield* credential(server, config, caller, force)
        if (Option.isNone(value)) return { url: config.url, headers: {} }
        const header = config.auth?.type === "secret" ? config.auth.header : undefined
        return { url: config.url, headers: header === undefined ? { authorization: `Bearer ${value.value}` } : { [header.toLowerCase()]: value.value } }
      })

      /** Runs `use` with the credential; on a 401 from an OAuth server, refreshes the tokens and tries once more. */
      const withCredential = <A>(server: Resource, caller: UpstreamCaller, use: (target: UpstreamTarget) => Effect.Effect<A, UpstreamUnauthorized | UpstreamCallFailed>) =>
        Effect.gen(function*() {
          const refusedCredential = failure(server, "the server refused the credential")
          const toFailure = (error: UpstreamUnauthorized | UpstreamCallFailed) => (error._tag === "UpstreamUnauthorized" ? refusedCredential : failure(server, error.message))
          const first = yield* Effect.result(use(yield* target(server, caller, false)))
          if (first._tag === "Success") return first.success
          const oauth = server.config.kind === "mcp_server" && server.config.auth?.type === "oauth"
          if (first.failure._tag !== "UpstreamUnauthorized" || !oauth) return yield* toFailure(first.failure)
          yield* Effect.annotateCurrentSpan({ "mcp.auth_retry": true })
          return yield* use(yield* target(server, caller, true)).pipe(Effect.mapError(toFailure))
        })

      return Upstream.of({
        listTools: Effect.fn("Upstream.listTools")(function*(server: Resource, caller: UpstreamCaller) {
          yield* Effect.annotateCurrentSpan({ "mcp.server": server.id })
          const key = cacheKey(server, caller)
          const cached = yield* cache.get(key, CachedTools)
          if (Option.isSome(cached)) return cached.value
          const tools = yield* withCredential(server, caller, (upstream) => client.listTools(upstream))
          // Several verify runs (or gateway sessions) can list the same server at once and write this key
          // together; KV refuses more than one write per key per second. A lost cache write costs a refetch only.
          yield* cache.set(key, CachedTools, tools, ToolListTtlSeconds).pipe(
            Effect.catchDefect((defect) => Effect.logWarning("tool list cache write failed", defect))
          )
          return tools
        }),
        callTool: Effect.fn("Upstream.callTool")(function*(server: Resource, caller: UpstreamCaller, tool: string, args: Readonly<Record<string, unknown>>) {
          yield* Effect.annotateCurrentSpan({ "mcp.server": server.id, "mcp.tool": tool })
          return yield* withCredential(server, caller, (upstream) => client.callTool(upstream, tool, args))
        })
      })
    })
  )
}

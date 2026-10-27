import { type IntegrationAction, type IntegrationConfig, PolicyDenied } from "@pc/domain"
import { cachedValidator } from "@pc/integrations/validation"
import { Effect, Option } from "effect"
import { allows, callDenials, type EffectiveGrant } from "../../access/resolution"
import { ConnectionResolver } from "../../connections/resolver"
import { IntegrationCatalog } from "../../integrations/catalog"
import { IntegrationCredentials } from "../../integrations/credentials"
import { IntegrationRunner } from "../../integrations/runner"
import { describe, toolName } from "../../mcp/naming"
import type { CallerScope, GatewayTool, ToolProvider } from "../../mcp/provider"
import { currentTraceContext } from "../../telemetry/trace-context"
import { annotationsFor } from "./annotations"
import { toFailure, toToolResult } from "./result"

/**
 * Shared OAuth2 integrations offer tools only once connected; other connections are usable as configured. A
 * per-user integration always offers them: a caller without their own account gets "connect your account".
 */
const connected = (config: IntegrationConfig): boolean =>
  config.connection.type !== "oauth2" || config.accountMode === "per_user" || config.connection.status === "connected"

/**
 * `<integration-slug>__<action>` for each supported action of every integration the caller holds `use` on.
 * Read and search actions need `use`, all others `write`; the resource's `actions` and each grant's
 * `conditions.tools` / `conditions.arguments` narrow further, exactly as for MCP server tools.
 */
export const makeIntegrationProvider = Effect.gen(function*() {
  const catalog = yield* IntegrationCatalog
  const runner = yield* IntegrationRunner
  const credentials = yield* IntegrationCredentials
  const resolver = yield* ConnectionResolver

  const toolFor = ({ principal, actor }: CallerScope, grant: EffectiveGrant, config: IntegrationConfig, action: IntegrationAction): GatewayTool => {
    const { resource } = grant
    // Compiled on the first call, not while listing: a listing covers every action of every integration.
    const validate = (args: unknown) => cachedValidator(config.pieceId, action.name, action.inputSchema)(args)
    return {
      definition: {
        name: toolName(resource, action.name),
        description: describe(resource, `${action.displayName}.`, action.description),
        inputSchema: action.inputSchema,
        annotations: annotationsFor(action)
      },
      target: resource,
      operation: action.name,
      prepare: (args) =>
        Effect.gen(function*() {
          const input = yield* validate(args)
          const [denied, ...more] = callDenials(grant, resource.id, action.name, action.requiredAction, input)
          if (denied !== undefined) return yield* new PolicyDenied({ reasons: [denied, ...more] })
          // Only after the grant check: which account (shared, or the caller's own) the call would act as.
          const connection = yield* resolver.context(resource, principal)
          const execute = Effect.gen(function*() {
            const auth = yield* credentials.forRun(resource, config, principal, actor)
            const trace = Option.getOrUndefined(yield* currentTraceContext)
            const request = { orgId: resource.orgId, resourceId: resource.id, pieceId: config.pieceId, actionName: action.name, auth, props: input }
            return toToolResult(yield* runner.run(trace === undefined ? request : { ...request, trace }))
          }).pipe(Effect.mapError((error) => toFailure(resource.name, error)))
          return { arguments: input, execute, connection }
        })
    }
  }

  const toolsFor = (scope: CallerScope, grant: EffectiveGrant): ReadonlyArray<GatewayTool> => {
    const config = grant.resource.config
    if (config.kind !== "integration" || !connected(config) || !runner.serves(config.pieceId)) return []
    const piece = catalog.piece(config.pieceId)
    if (Option.isNone(piece)) return []
    return piece.value.actions
      .filter((action) => action.support.status === "supported" && (config.actions === undefined || config.actions.includes(action.name)))
      .filter((action) => callDenials(grant, grant.resource.id, action.name, action.requiredAction).length === 0)
      .map((action) => toolFor(scope, grant, config, action))
  }

  const provider: ToolProvider = {
    source: "integration",
    tools: (scope) =>
      Effect.succeed(
        Array.from(scope.access.values())
          .filter((grant) => grant.resource.config.kind === "integration" && allows(grant, "use"))
          .flatMap((grant) => toolsFor(scope, grant))
      )
  }
  return provider
})

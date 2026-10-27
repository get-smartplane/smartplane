import type { AccountNotConnected, Actor, ConnectionContext, InvalidInput, PolicyDenied, Principal, Resource, UpstreamFailure } from "@pc/domain"
import { Context, type Effect } from "effect"
import type { EffectiveAccess } from "../access/resolution"
import type { McpTool, ToolResult } from "./sdk"

/** Who is asking, resolved once per gateway request and shared by every provider. */
export interface CallerScope {
  readonly principal: Principal
  readonly actor: Actor
  readonly access: EffectiveAccess
}

/** A call that passed argument validation and the grant check, ready for guards and then execution. */
export interface PreparedCall {
  /** What guards classify and the audit log records: normalised arguments, never credentials. */
  readonly arguments: unknown
  readonly execute: Effect.Effect<ToolResult, UpstreamFailure>
  /**
   * The account the call goes through (the shared one or the caller's own), resolved after the grant check
   * and before guards, from metadata only; absent when the target needs no credential.
   */
  readonly connection?: ConnectionContext | null
}

/**
 * One tool as the agent sees it. `target` is the resource that guards evaluate and audit events point at;
 * `null` only for built-ins, which read resources the caller already holds `read` on.
 */
export interface GatewayTool {
  readonly definition: McpTool
  readonly target: Resource | null
  /** The operation name guards and audit events see, e.g. the upstream tool name or `query`. */
  readonly operation: string
  /**
   * Validates arguments and checks they fit the caller's grant (e.g. `write` for mutating methods).
   * `InvalidInput` is a malformed call; `PolicyDenied` is a call the grant or resource config forbids;
   * `AccountNotConnected` is a granted call with no account to go through.
   */
  readonly prepare: (args: Readonly<Record<string, unknown>>) => Effect.Effect<PreparedCall, InvalidInput | PolicyDenied | AccountNotConnected>
}

/** A source of gateway tools: built-ins, upstream MCP servers, HTTP APIs, databases, ... */
export interface ToolProvider {
  readonly source: string
  /** Only tools the caller is granted; anything listed here is callable. */
  readonly tools: (scope: CallerScope) => Effect.Effect<ReadonlyArray<GatewayTool>>
}

/** The providers the gateway serves, in precedence order: on a name clash the earlier provider wins. */
export class ToolProviders extends Context.Service<ToolProviders, ReadonlyArray<ToolProvider>>()("api/mcp/ToolProviders") {}

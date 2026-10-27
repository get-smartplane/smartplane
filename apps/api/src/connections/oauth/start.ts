import type { AuthorizationServerChanged, InvalidInput, OAuthReturnTo, OAuthStart, Resource, UpstreamFailure, UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { IntegrationCatalog } from "../../integrations/catalog"
import { oauthState } from "../../integrations/oauth/pkce"
import { StateTtlSeconds } from "../../integrations/oauth/state-store"
import { AppConfig } from "../../platform/config"
import { McpOAuthDiscovery } from "./discovery"
import { PendingConnections } from "./pending"
import { type AuthorizationPlan, authFingerprint, integrationPlan, mcpPlan, notOAuth } from "./plan"
import { McpClientRegistration } from "./registration"

export const connectionCallbackPath = "/api/connections/oauth/callback"

/**
 * Starts an OAuth sign-in for a connection: an MCP server's (shared or per-user) or a member's own sign-in to
 * a per-user integration. Who may start which is decided by the caller (`Connections`); this builds the
 * authorization and remembers it under a single-use state for the callback.
 */
export class ConnectionOAuth extends Context.Service<ConnectionOAuth, {
  /**
   * `owner` null: the shared account. `startedBy` must finish the flow in the same dashboard session.
   * `returnTo` lands the browser on that dashboard page instead of the resource's (or My connections).
   */
  readonly start: (resource: Resource, startedBy: UserId, owner: UserId | null, returnTo?: OAuthReturnTo) => Effect.Effect<OAuthStart, InvalidInput | UpstreamFailure | AuthorizationServerChanged>
}>()("api/connections/ConnectionOAuth") {
  static readonly layer = Layer.effect(
    ConnectionOAuth,
    Effect.gen(function*() {
      const redirectUri = `${(yield* AppConfig).API_URL}${connectionCallbackPath}`
      const pending = yield* PendingConnections
      const services = Effect.provide(Layer.mergeAll(
        Layer.succeed(McpOAuthDiscovery, yield* McpOAuthDiscovery),
        Layer.succeed(McpClientRegistration, yield* McpClientRegistration),
        Layer.succeed(IntegrationCatalog, yield* IntegrationCatalog)
      ))

      const planFor = (
        resource: Resource,
        state: string
      ): Effect.Effect<AuthorizationPlan, InvalidInput | UpstreamFailure | AuthorizationServerChanged, McpOAuthDiscovery | McpClientRegistration | IntegrationCatalog> => {
        const { config } = resource
        if (config.kind === "mcp_server" && config.auth?.type === "oauth") return mcpPlan(resource, config.auth, config.url, redirectUri, state)
        if (config.kind === "integration" && config.connection.type === "oauth2") return integrationPlan(resource, redirectUri, state)
        return Effect.fail(notOAuth(resource))
      }

      return ConnectionOAuth.of({
        start: Effect.fn("ConnectionOAuth.start")(function*(resource: Resource, startedBy: UserId, owner: UserId | null, returnTo?: OAuthReturnTo) {
          yield* Effect.annotateCurrentSpan({ "resource.id": resource.id, "connection.mode": owner === null ? "shared" : "per_user" })
          const state = yield* oauthState
          const plan = yield* services(planFor(resource, state))
          yield* pending.put(state, {
            orgId: resource.orgId,
            resourceId: resource.id,
            userId: startedBy,
            owner,
            fingerprint: authFingerprint(resource),
            codeVerifier: plan.codeVerifier,
            tokenUrl: plan.tokenUrl,
            client: plan.client,
            ...(plan.refreshUrl === undefined ? {} : { refreshUrl: plan.refreshUrl }),
            ...(plan.resource === undefined ? {} : { resource: plan.resource }),
            ...(plan.userinfoUrl === undefined ? {} : { userinfoUrl: plan.userinfoUrl }),
            ...(plan.issuer === undefined ? {} : { issuer: plan.issuer }),
            ...(returnTo === undefined ? {} : { returnTo })
          })
          const started: OAuthStart = { authorizeUrl: plan.authorizeUrl, expiresAt: DateTime.add(yield* DateTime.now, { seconds: StateTtlSeconds }) }
          return started
        })
      })
    })
  )
}

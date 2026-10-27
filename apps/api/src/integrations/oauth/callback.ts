import type { IntegrationCallbackFailure, OAuthReturnTo, Principal, ResourceId } from "@pc/domain"
import { Clock, Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { AuditLog } from "../../audit/audit-log"
import { actorOf } from "../../audit/actor"
import { ConnectionsRepo } from "../../connections/connections-repo"
import { idTokenIdentity } from "../../connections/oauth/identity"
import { AppConfig } from "../../platform/config"
import { Ids } from "../../platform/ids"
import { ResourcesRepo } from "../../resources/resources-repo"
import { Secrets } from "../../secrets/secrets"
import { IntegrationCatalog } from "../catalog"
import { clientOf, oauthAppOf } from "./app"
import { callbackPath } from "./flow"
import { OAuthStates } from "./state-store"
import { TokenEndpoint } from "./token-endpoint"
import { tokenSetFrom } from "./token-set"
import { OAuthTokens } from "./tokens"

export const CallbackQuery = Schema.Struct({
  state: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String)
})
export type CallbackQuery = typeof CallbackQuery.Type

/** Completes an authorization: exchanges the code, stores the tokens encrypted, marks the integration connected. */
export class OAuthCallback extends Context.Service<OAuthCallback, {
  /** Returns where to send the browser. `session` is the dashboard session that must have started the flow. */
  readonly complete: (query: CallbackQuery, session: Option.Option<Principal>) => Effect.Effect<string>
}>()("api/integrations/OAuthCallback") {
  static readonly layer = Layer.effect(
    OAuthCallback,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const states = yield* OAuthStates
      const repo = yield* ResourcesRepo
      const endpoint = yield* TokenEndpoint
      const tokens = yield* OAuthTokens
      const audit = yield* AuditLog
      const secrets = yield* Secrets
      const catalog = yield* IntegrationCatalog
      const connections = yield* ConnectionsRepo

      const result = (outcome: "connected" | IntegrationCallbackFailure) => outcome === "connected" ? "integration=connected" : `integration=error&reason=${outcome}`
      const page = (id: ResourceId | null, outcome: "connected" | IntegrationCallbackFailure, returnTo?: OAuthReturnTo) =>
        id === null ? `${config.APP_URL}/resources?${result(outcome)}`
          : returnTo === "setup" ? `${config.APP_URL}/setup?step=tool&resource=${id}&${result(outcome)}`
          : returnTo === "integrations" ? `${config.APP_URL}/integrations?resource=${id}&${result(outcome)}`
          : `${config.APP_URL}/resources/${id}?${result(outcome)}`

      const complete = Effect.fn("OAuthCallback.complete")(function*(query: CallbackQuery, session: Option.Option<Principal>) {
        const pending = query.state === undefined ? Option.none() : yield* states.take(query.state)
        if (Option.isNone(pending)) return page(null, "expired_state")
        const { orgId, resourceId, userId, clientId, codeVerifier, returnTo } = pending.value
        const principal = Option.filter(session, (p) => p._tag === "User" && p.userId === userId && p.orgId === orgId)
        if (Option.isNone(principal)) return page(resourceId, "session_mismatch", returnTo)
        const fail = (reason: IntegrationCallbackFailure) =>
          Effect.as(audit.by(principal.value, "integration.connection_failed", { type: "resource", id: resourceId }, { reason }), page(resourceId, reason, returnTo))
        if (query.error !== undefined || query.code === undefined) return yield* fail("denied")

        const resource = yield* repo.find(orgId, resourceId)
        const app = yield* Effect.option(Effect.flatMap(Effect.fromOption(resource), (found) => Effect.provideService(oauthAppOf(found), IntegrationCatalog, catalog)))
        if (Option.isNone(app) || app.value.connection.clientId !== clientId) return yield* fail("integration_changed")

        const actor = actorOf(principal.value)
        const grant = { grant_type: "authorization_code", code: query.code, redirect_uri: `${config.API_URL}${callbackPath}`, ...(codeVerifier === null ? {} : { code_verifier: codeVerifier }) }
        const exchanged = yield* clientOf(app.value, actor).pipe(
          Effect.provideService(Secrets, secrets),
          Effect.flatMap((client) => endpoint.request(app.value.tokenUrl, client, grant)),
          Effect.flatMap((response) => Effect.flatMap(Clock.currentTimeMillis, (now) => tokenSetFrom(response, now))),
          Effect.option
        )
        if (Option.isNone(exchanged)) return yield* fail("exchange_failed")

        const tokenSecretId = yield* tokens.save(app.value, exchanged.value, userId)
        const connection = { ...app.value.connection, status: "connected" as const, tokenSecretId }
        yield* repo.update({ ...app.value.resource, config: { ...app.value.config, connection } }).pipe(Effect.orDie)
        // Who connected the shared account and as whom; the tokens themselves stay in the managed secret.
        const accountIdentity = Option.getOrNull(idTokenIdentity(exchanged.value.data))
        if (principal.value._tag === "User") {
          yield* connections.put({
            id: yield* Ids.connection,
            orgId,
            resourceId,
            mode: "shared",
            userId: null,
            method: "oauth",
            status: "connected",
            accountIdentity,
            connectedBy: { userId, email: principal.value.email },
            connectedAt: yield* DateTime.now,
            refreshedAt: null
          }, null)
        }
        yield* audit.by(principal.value, "connection.connected", { type: "resource", id: resourceId }, { mode: "shared", method: "oauth", accountIdentity })
        yield* audit.by(principal.value, "integration.connected", { type: "resource", id: resourceId }, {
          pieceId: app.value.config.pieceId,
          tokenSecretId,
          scope: exchanged.value.scope,
          refreshable: exchanged.value.refreshToken !== undefined
        })
        return page(resourceId, "connected", returnTo)
      })

      return OAuthCallback.of({ complete })
    })
  )
}

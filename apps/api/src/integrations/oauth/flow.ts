import { type Forbidden, type InvalidInput, NotFound, type OAuthReturnTo, type OAuthSettings, type OAuthStart, type Principal, type Resource, type ResourceId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { AuditLog } from "../../audit/audit-log"
import { requirePermission, requireUser } from "../../auth/permissions"
import { AppConfig } from "../../platform/config"
import { ResourcesRepo } from "../../resources/resources-repo"
import { IntegrationCatalog } from "../catalog"
import { oauthAppOf } from "./app"
import { authorizeUrl } from "./authorize-url"
import { codeChallenge, codeVerifier, oauthState } from "./pkce"
import { OAuthStates, StateTtlSeconds } from "./state-store"

export const callbackPath = "/api/integrations/oauth/callback"

/**
 * Starting and ending an integration's OAuth2 connection. The org registers its own OAuth app at the
 * provider (client id in the integration's config, client secret as a `secret` resource) with the
 * redirect URI from `settings`; Smartplane then runs the authorization-code flow, with PKCE when the piece
 * supports it. The callback half lives in `callback.ts`.
 */
export class IntegrationOAuth extends Context.Service<IntegrationOAuth, {
  readonly settings: (principal: Principal) => Effect.Effect<OAuthSettings, Forbidden>
  readonly start: (principal: Principal, id: ResourceId, returnTo?: OAuthReturnTo) => Effect.Effect<OAuthStart, Forbidden | NotFound | InvalidInput>
  readonly disconnect: (principal: Principal, id: ResourceId) => Effect.Effect<Resource, Forbidden | NotFound | InvalidInput>
}>()("api/integrations/IntegrationOAuth") {
  static readonly layer = Layer.effect(
    IntegrationOAuth,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const repo = yield* ResourcesRepo
      const states = yield* OAuthStates
      const audit = yield* AuditLog
      const catalog = yield* IntegrationCatalog
      const redirectUri = `${config.API_URL}${callbackPath}`

      const load = (principal: Principal, id: ResourceId) =>
        repo.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "resource", id })))
      const appOf = (resource: Resource) => Effect.provideService(oauthAppOf(resource), IntegrationCatalog, catalog)

      const start = Effect.fn("IntegrationOAuth.start")(function*(principal: Principal, id: ResourceId, returnTo?: OAuthReturnTo) {
        yield* requirePermission(principal, "resources:manage")
        const user = yield* requireUser(principal)
        const app = yield* appOf(yield* load(principal, id))
        const state = yield* oauthState
        const verifier = app.auth.pkce === null ? null : yield* codeVerifier
        const challenge = verifier === null || app.auth.pkce === null ? null : yield* codeChallenge(verifier, app.auth.pkce)
        yield* states.put(state, { orgId: principal.orgId, resourceId: id, userId: user.userId, clientId: app.connection.clientId, codeVerifier: verifier, ...(returnTo === undefined ? {} : { returnTo }) })
        yield* Effect.annotateCurrentSpan({ "resource.id": id, "piece.id": app.config.pieceId, "oauth.pkce": verifier !== null })
        const started: OAuthStart = {
          authorizeUrl: authorizeUrl({ auth: app.auth, connection: app.connection, authUrl: app.authUrl, scopes: app.scopes, redirectUri, state, codeChallenge: challenge }),
          expiresAt: DateTime.add(yield* DateTime.now, { seconds: StateTtlSeconds })
        }
        return started
      })

      const disconnect = Effect.fn("IntegrationOAuth.disconnect")(function*(principal: Principal, id: ResourceId) {
        yield* requirePermission(principal, "resources:manage")
        const user = yield* requireUser(principal)
        const app = yield* appOf(yield* load(principal, id))
        const { tokenSecretId: _forgotten, ...connection } = app.connection
        const next: Resource = { ...app.resource, config: { ...app.config, connection: { ...connection, status: "not_connected" } }, updatedAt: yield* DateTime.now }
        yield* repo.update(next).pipe(Effect.orDie)
        const tokenSecretId = app.connection.tokenSecretId
        if (tokenSecretId !== undefined && Option.isSome(yield* repo.find(principal.orgId, tokenSecretId))) {
          yield* repo.remove(principal.orgId, tokenSecretId, user.userId)
          yield* audit.by(principal, "resource.deleted", { type: "resource", id: tokenSecretId }, { reason: "oauth_disconnected", integrationId: id })
        }
        yield* audit.by(principal, "resource.updated", { type: "resource", id }, { fields: ["config"], connection: "disconnected" })
        return next
      })

      return IntegrationOAuth.of({
        settings: (principal) => Effect.as(requirePermission(principal, "resources:read"), { redirectUri }),
        start,
        disconnect
      })
    })
  )
}

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Forbidden, InvalidInput, NotFound } from "../errors"
import { ResourceId } from "../ids"
import { CatalogFilter, IntegrationPiece, IntegrationPieceSummary } from "../integrations/catalog"
import { PieceId } from "../integrations/names"
import { HttpUrl, Timestamp } from "../primitives"
import { Resource } from "../resources/resource"
import { Authentication } from "./security"

/** Where the browser goes to authorize; the provider then redirects to `OAuthSettings.redirectUri`. */
export const OAuthStart = Schema.Struct({ authorizeUrl: HttpUrl, expiresAt: Timestamp }).annotate({ identifier: "OAuthStart" })
export type OAuthStart = typeof OAuthStart.Type

/** The redirect URI to register on the org's OAuth app at each provider. */
export const OAuthSettings = Schema.Struct({ redirectUri: HttpUrl }).annotate({ identifier: "OAuthSettings" })
export type OAuthSettings = typeof OAuthSettings.Type

/**
 * A dashboard page the OAuth callback may return to instead of the resource's own page: the setup flow's tool
 * step, or the Integrations catalog.
 */
export const OAuthReturnTo = Schema.Literals(["setup", "integrations"]).annotate({ identifier: "OAuthReturnTo" })
export type OAuthReturnTo = typeof OAuthReturnTo.Type

export const OAuthStartQuery = Schema.Struct({ returnTo: Schema.optionalKey(OAuthReturnTo) }).annotate({ identifier: "OAuthStartQuery" })
export type OAuthStartQuery = typeof OAuthStartQuery.Type

const params = { id: ResourceId }

/**
 * Integrations are `integration` resources (see `IntegrationConfig`), created and edited through /resources.
 * This group serves the piece catalog and the OAuth2 connection flow. After authorizing, the browser lands on
 * `<APP_URL>/resources/<id>?integration=connected`, or `?integration=error&reason=<code>`. Started with
 * `returnTo=setup`, it lands on `<APP_URL>/setup?step=tool&resource=<id>&integration=…` instead, and with
 * `returnTo=integrations` on `<APP_URL>/integrations?resource=<id>&integration=…`.
 */
export class IntegrationsApi extends HttpApiGroup.make("integrations")
  .add(
    HttpApiEndpoint.get("listCatalog", "/catalog", { query: CatalogFilter, success: Schema.Array(IntegrationPieceSummary), error: Forbidden }),
    HttpApiEndpoint.get("getPiece", "/catalog/:pieceId", { params: { pieceId: PieceId }, success: IntegrationPiece, error: [Forbidden, NotFound] }),
    HttpApiEndpoint.get("oauthSettings", "/oauth/settings", { success: OAuthSettings, error: Forbidden }),
    /** Requires `resources:manage`; the integration must use an `oauth2` connection. */
    HttpApiEndpoint.post("startOAuth", "/:id/oauth/start", { params, query: OAuthStartQuery, success: OAuthStart, error: [Forbidden, NotFound, InvalidInput] }),
    /** Forgets the stored token (its secret is deleted) and marks the connection `not_connected`. */
    HttpApiEndpoint.post("disconnectOAuth", "/:id/oauth/disconnect", { params, success: Resource, error: [Forbidden, NotFound, InvalidInput] })
  )
  .middleware(Authentication)
  .prefix("/integrations")
{}

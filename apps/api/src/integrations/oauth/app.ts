import {
  type Actor,
  type IntegrationConfig,
  InvalidInput,
  type OAuth2Connection,
  type OAuth2PieceAuth,
  type Resource,
  UpstreamFailure
} from "@pc/domain"
import { Effect, Option } from "effect"
import { Secrets } from "../../secrets/secrets"
import { IntegrationCatalog } from "../catalog"
import { resolveProps } from "./connection-props"
import { refreshUrlFor } from "./refresh-url"
import { fillScopes, fillTemplate } from "./templates"
import type { OAuthClient } from "./token-endpoint"

/** An integration resource connected by OAuth2, with the piece's endpoints filled in for this connection. */
export interface OAuthApp {
  readonly resource: Resource
  readonly config: IntegrationConfig
  readonly connection: OAuth2Connection
  readonly auth: OAuth2PieceAuth
  readonly authUrl: string
  readonly tokenUrl: string
  /** Where refresh grants go; the token URL except for providers with a separate refresh endpoint. */
  readonly refreshUrl: string
  /** The scopes to request, placeholders filled. */
  readonly scopes: ReadonlyArray<string>
  /** The connection's OAuth2 fields with the piece's defaults applied: what endpoints and pieces see. */
  readonly props: Readonly<Record<string, string>>
}

const invalid = (message: string) => new InvalidInput({ message, field: "config.connection" })
const needs = (field: string) => invalid(`the connection needs the "${field}" field`)

/** Fails with `InvalidInput` when the resource is not an OAuth2 integration of a bundled piece. */
export const oauthAppOf = (resource: Resource): Effect.Effect<OAuthApp, InvalidInput, IntegrationCatalog> =>
  Effect.gen(function*() {
    const config = resource.config
    if (config.kind !== "integration" || config.connection.type !== "oauth2") return yield* invalid("the integration does not connect with OAuth2")
    const piece = (yield* IntegrationCatalog).piece(config.pieceId)
    const auth = Option.flatMap(piece, (found) => Option.fromUndefinedOr(found.auth.find((entry) => entry.type === "oauth2")))
    if (Option.isNone(auth) || auth.value.type !== "oauth2") return yield* invalid(`${config.pieceId} does not offer OAuth2`)
    const resolved = resolveProps(auth.value.fields, config.connection.props ?? {})
    if ("invalid" in resolved) return yield* invalid(resolved.invalid)
    const { props } = resolved
    const authUrl = fillTemplate(auth.value.authUrl, props)
    const tokenUrl = fillTemplate(auth.value.tokenUrl, props)
    const scopes = fillScopes(auth.value.scopes, props)
    if ("missing" in authUrl) return yield* needs(authUrl.missing)
    if ("missing" in tokenUrl) return yield* needs(tokenUrl.missing)
    if ("missing" in scopes) return yield* needs(scopes.missing)
    return { resource, config, connection: config.connection, auth: auth.value, authUrl: authUrl.url, tokenUrl: tokenUrl.url, refreshUrl: refreshUrlFor(config.pieceId, tokenUrl.url), scopes: scopes.scopes, props }
  })

/** The org's OAuth app credentials; reading the client secret is audited like any secret read. */
export const clientOf = (app: OAuthApp, actor: Actor): Effect.Effect<OAuthClient, UpstreamFailure, Secrets> =>
  Secrets.use((secrets) => secrets.reveal(app.resource.orgId, app.connection.clientSecretId, "oauth_client", actor)).pipe(
    Effect.mapError(() => new UpstreamFailure({ upstream: app.resource.name, message: "the OAuth app's client secret is missing" })),
    Effect.map((clientSecret) => ({ clientId: app.connection.clientId, clientSecret, authentication: app.auth.clientAuthentication }))
  )

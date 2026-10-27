import { ResourceId } from "@pc/domain"
import { Schema } from "effect"
import { OAuthTokenSet } from "../integrations/oauth/token-set"

/** How the client authenticates at the token endpoint: HTTP Basic, form body, or not at all (public client). */
export const ClientAuthentication = Schema.Literals(["header", "body", "none"])
export type ClientAuthentication = typeof ClientAuthentication.Type

/** The OAuth client a connection's tokens were issued to; refreshes must present the same client. */
export const ConnectionClient = Schema.Struct({
  clientId: Schema.String,
  authentication: ClientAuthentication,
  /** Issued by dynamic client registration; it lives only inside the encrypted credential. */
  clientSecret: Schema.optionalKey(Schema.String),
  /** An admin-supplied client's secret, as a `secret` resource read (audited) when needed. */
  clientSecretId: Schema.optionalKey(ResourceId)
})
export type ConnectionClient = typeof ConnectionClient.Type

/** Where and how an OAuth connection refreshes its tokens. */
export const OAuthGrantTarget = Schema.Struct({
  client: ConnectionClient,
  tokenUrl: Schema.String,
  /** Where refresh grants go when the provider has a separate refresh endpoint (Figma). */
  refreshUrl: Schema.optionalKey(Schema.String),
  /** RFC 8707 resource indicator, sent with every token request for MCP servers. */
  resource: Schema.optionalKey(Schema.String)
})
export type OAuthGrantTarget = typeof OAuthGrantTarget.Type

/** What a connection's envelope holds. Only apps/api ever opens it. */
export const StoredCredential = Schema.Union([
  Schema.Struct({ type: Schema.tag("secret"), value: Schema.String }),
  Schema.Struct({ type: Schema.tag("oauth"), tokens: OAuthTokenSet, ...OAuthGrantTarget.fields })
])
export type StoredCredential = typeof StoredCredential.Type
export type StoredOAuth = Extract<StoredCredential, { readonly type: "oauth" }>

export const StoredCredentialJson = Schema.fromJsonString(Schema.toCodecJson(StoredCredential))
export const ConnectionClientJson = Schema.fromJsonString(Schema.toCodecJson(ConnectionClient))

import { Schema } from "effect"

/** How an organisation connects a piece to its account. `none` is for pieces that need no credential. */
export const IntegrationAuthType = Schema.Literals(["none", "secret_text", "basic", "custom", "oauth2"])
export type IntegrationAuthType = typeof IntegrationAuthType.Type

/** One input of a custom or OAuth2 connection form. `secret` fields belong in the connection's secret. */
export const AuthField = Schema.Struct({
  name: Schema.NonEmptyString,
  displayName: Schema.String,
  description: Schema.optionalKey(Schema.String),
  required: Schema.Boolean,
  kind: Schema.Literals(["text", "long_text", "secret", "number", "checkbox", "select"]),
  /** The piece's default, used when a connection leaves the field blank (e.g. a Microsoft tenant `common`). */
  defaultValue: Schema.optionalKey(Schema.String),
  /** Choices of a `select` field. */
  options: Schema.optionalKey(Schema.Array(Schema.Struct({ label: Schema.String, value: Schema.String })))
}).annotate({ identifier: "AuthField" })
export type AuthField = typeof AuthField.Type

const FieldLabel = Schema.Struct({ displayName: Schema.String, description: Schema.optionalKey(Schema.String) })

const described = { displayName: Schema.String, description: Schema.optionalKey(Schema.String) }

/**
 * Non-secret description of a connection method a piece accepts, for building the connection form. A piece
 * may accept several (GitHub: OAuth2, a GitHub App, or a personal token).
 */
export const PieceAuth = Schema.Union([
  Schema.Struct({ type: Schema.tag("secret_text"), ...described }),
  Schema.Struct({ type: Schema.tag("basic"), ...described, username: FieldLabel, password: FieldLabel }),
  Schema.Struct({ type: Schema.tag("custom"), ...described, fields: Schema.Array(AuthField) }),
  Schema.Struct({
    type: Schema.tag("oauth2"),
    ...described,
    /** May contain `{field}` placeholders filled from the connection's `props` (e.g. a Zendesk subdomain). */
    authUrl: Schema.NonEmptyString,
    tokenUrl: Schema.NonEmptyString,
    /** May contain placeholders too (Microsoft Dynamics: `{hostUrl}/.default`). */
    scopes: Schema.Array(Schema.String),
    /** PKCE method when the provider supports it. */
    pkce: Schema.NullOr(Schema.Literals(["plain", "S256"])),
    /** Where the client credentials go on the token request: HTTP Basic header or form body. */
    clientAuthentication: Schema.Literals(["header", "body"]),
    /** Extra authorize-URL parameters the provider needs (e.g. Notion's `owner=user`). */
    extraParams: Schema.Record(Schema.String, Schema.String),
    prompt: Schema.NullOr(Schema.Literals(["none", "consent", "login", "omit"])),
    /** Non-secret per-connection inputs, e.g. a subdomain. */
    fields: Schema.Array(AuthField)
  })
]).annotate({ identifier: "PieceAuth" })
export type PieceAuth = typeof PieceAuth.Type
export type OAuth2PieceAuth = Extract<PieceAuth, { readonly type: "oauth2" }>

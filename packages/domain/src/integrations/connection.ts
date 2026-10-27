import { Schema } from "effect"
import { AccountMode } from "../connections/account"
import { ResourceId } from "../ids"
import { ActionName, PieceId } from "./names"

/**
 * Connections reference `secret` resources and never hold credentials inline. What each secret contains:
 * - `secret_text`: the API key or token itself.
 * - `basic`: JSON `{ "username": ..., "password": ... }`.
 * - `custom`: JSON object of the piece's custom fields (see the catalog's `PieceAuth.fields`).
 */
const credentialConnections = [
  Schema.Struct({ type: Schema.tag("none") }),
  // `secretId` is absent only in `per_user` mode, where each member connects their own credential of this shape.
  Schema.Struct({ type: Schema.tag("secret_text"), secretId: Schema.optionalKey(ResourceId) }),
  Schema.Struct({ type: Schema.tag("basic"), secretId: Schema.optionalKey(ResourceId) }),
  Schema.Struct({ type: Schema.tag("custom"), secretId: Schema.optionalKey(ResourceId) })
] as const

const oauth2App = {
  /** The org's own OAuth app at the provider. Not a secret; the client secret is `clientSecretId`. */
  clientId: Schema.NonEmptyString.check(Schema.isMaxLength(512)),
  clientSecretId: ResourceId,
  /** Values for the piece's non-secret OAuth2 fields, e.g. `{ "subdomain": "acme" }`. */
  props: Schema.optionalKey(Schema.Record(Schema.String, Schema.String.check(Schema.isMaxLength(512))))
}

/** `needs_reauth`: the provider rejected the stored refresh token; an admin must connect again. */
export const OAuth2Status = Schema.Literals(["not_connected", "connected", "needs_reauth"])
export type OAuth2Status = typeof OAuth2Status.Type

/** What an admin submits. OAuth2 tokens come only from the authorization flow, never from input. */
export const IntegrationConnectionInput = Schema.Union([
  ...credentialConnections,
  Schema.Struct({ type: Schema.tag("oauth2"), ...oauth2App })
]).annotate({ identifier: "IntegrationConnectionInput" })
export type IntegrationConnectionInput = typeof IntegrationConnectionInput.Type

/** A stored connection. For OAuth2, Smartplane manages `status` and the token secret it created. */
export const IntegrationConnection = Schema.Union([
  ...credentialConnections,
  Schema.Struct({
    type: Schema.tag("oauth2"),
    ...oauth2App,
    status: OAuth2Status,
    /** Envelope-encrypted token set (access + refresh token), written by the OAuth callback and refreshes. */
    tokenSecretId: Schema.optionalKey(ResourceId)
  })
]).annotate({ identifier: "IntegrationConnection" })
export type IntegrationConnection = typeof IntegrationConnection.Type
export type OAuth2Connection = Extract<IntegrationConnection, { readonly type: "oauth2" }>

const integrationFields = {
  kind: Schema.tag("integration"),
  pieceId: PieceId,
  /** Absent means `shared`. `per_user`: each member signs in (OAuth2) or pastes their own credential. */
  accountMode: Schema.optionalKey(AccountMode),
  /** Absent: every supported action of the piece. Grants can narrow further with `conditions.tools`. */
  actions: Schema.optionalKey(Schema.NonEmptyArray(ActionName))
}

/** An Activepieces piece run by Smartplane: Smartplane owns its credentials, authorization, execution and audit. */
/** A shared secret connection names its secret; a per-user one must not (each member brings their own). */
const secretRules = Schema.makeFilter((config: { readonly accountMode?: AccountMode; readonly connection: { readonly type: string; readonly secretId?: ResourceId } }) => {
  if (config.connection.type === "none" || config.connection.type === "oauth2") return undefined
  const shared = (config.accountMode ?? "shared") === "shared"
  if (shared && config.connection.secretId === undefined) return { path: ["connection", "secretId"], issue: "a shared connection needs its secret" }
  if (!shared && config.connection.secretId !== undefined) return { path: ["connection", "secretId"], issue: "per-user credentials are connected by each member" }
  return undefined
})

export const IntegrationConfig = Schema.Struct({ ...integrationFields, connection: IntegrationConnection }).check(secretRules).annotate({
  identifier: "IntegrationConfig"
})
export type IntegrationConfig = typeof IntegrationConfig.Type

export const IntegrationConfigInput = Schema.Struct({ ...integrationFields, connection: IntegrationConnectionInput }).check(secretRules).annotate({
  identifier: "IntegrationConfigInput"
})
export type IntegrationConfigInput = typeof IntegrationConfigInput.Type

/**
 * The stored config for an admin's input. OAuth2 keeps its token and status while the OAuth app is
 * unchanged; a different client id or secret means the old token no longer belongs to it.
 */
export const storedIntegrationConfig = (input: IntegrationConfigInput, current?: IntegrationConfig): IntegrationConfig => {
  const { connection, ...rest } = input
  if (connection.type !== "oauth2") return { ...rest, connection }
  const previous = current?.pieceId === input.pieceId ? current.connection : undefined
  if (previous?.type === "oauth2" && previous.clientId === connection.clientId && previous.clientSecretId === connection.clientSecretId) {
    const { status, tokenSecretId } = previous
    return { ...rest, connection: { ...connection, status, ...(tokenSecretId === undefined ? {} : { tokenSecretId }) } }
  }
  return { ...rest, connection: { ...connection, status: "not_connected" } }
}

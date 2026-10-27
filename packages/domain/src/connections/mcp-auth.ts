import { Schema } from "effect"
import { ResourceId } from "../ids"
import { HttpUrl } from "../primitives"

/** A header name such as `X-Api-Key`; the value is the credential, verbatim. */
export const CredentialHeader = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9-]{1,64}$/)).annotate({ identifier: "CredentialHeader" })

/** An OAuth scope token (RFC 6749 §3.3). */
export const OAuthScope = Schema.String.check(Schema.isPattern(/^[\x21\x23-\x5B\x5D-\x7E]{1,256}$/))

/**
 * How the gateway authenticates to an upstream MCP server.
 * - `none`: no credential.
 * - `secret`: a static token, sent as `Authorization: Bearer <token>` or verbatim in `header`. In `shared`
 *   mode `secretId` names the org's `secret` resource; in `per_user` mode each member pastes their own and
 *   `secretId` is absent.
 * - `oauth`: the MCP authorization spec (protected-resource metadata, authorization-server metadata,
 *   dynamic client registration or the admin's `clientId` / `clientSecretId`, authorization code + PKCE with
 *   the `resource` indicator). Tokens live in the resource's connections, never in the config.
 */
export const McpAuth = Schema.Union([
  Schema.Struct({ type: Schema.tag("none") }),
  Schema.Struct({
    type: Schema.tag("secret"),
    secretId: Schema.optionalKey(ResourceId),
    header: Schema.optionalKey(CredentialHeader)
  }),
  Schema.Struct({
    type: Schema.tag("oauth"),
    /** Absent: register a client dynamically (RFC 7591) at the authorization server. */
    clientId: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(512))),
    /** The admin-supplied client's secret, as a `secret` resource; absent for public clients. */
    clientSecretId: Schema.optionalKey(ResourceId),
    /** Absent: the scopes the server advertises, if any. */
    scopes: Schema.optionalKey(Schema.NonEmptyArray(OAuthScope)),
    /**
     * The authorization server an admin-supplied client belongs to (its RFC 8414 `issuer`) and that server's
     * token endpoint. Set by the admin, or pinned on the first successful sign-in. Discovery that names
     * another server is refused, so the client and its secret are never presented anywhere else.
     */
    issuer: Schema.optionalKey(HttpUrl.check(Schema.isMaxLength(2048))),
    tokenEndpoint: Schema.optionalKey(HttpUrl.check(Schema.isMaxLength(2048)))
  })
]).annotate({ identifier: "McpAuth" })
export type McpAuth = typeof McpAuth.Type
export type McpOAuth = Extract<McpAuth, { readonly type: "oauth" }>

/**
 * An admin's edit keeps the pinned authorization server while the client stays the same (the admin's form
 * does not send the pins back); a new client starts unpinned and is pinned again on its first sign-in.
 */
export const keepPinnedAuthServer = (input: McpAuth | undefined, current: McpAuth | undefined): McpAuth | undefined => {
  if (input?.type !== "oauth" || current?.type !== "oauth" || input.clientId === undefined) return input
  if (input.clientId !== current.clientId || input.clientSecretId !== current.clientSecretId) return input
  if (input.issuer !== undefined || input.tokenEndpoint !== undefined) return input
  return {
    ...input,
    ...(current.issuer === undefined ? {} : { issuer: current.issuer }),
    ...(current.tokenEndpoint === undefined ? {} : { tokenEndpoint: current.tokenEndpoint })
  }
}

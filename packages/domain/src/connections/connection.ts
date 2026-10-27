import { Schema } from "effect"
import { ConnectionId, OrgId, ResourceId, UserId } from "../ids"
import { Name, Timestamp } from "../primitives"
import { ResourceKind } from "../resources/config"
import { SecretValue } from "../resources/secret"
import { AccountIdentity, AccountMode, ConnectedBy } from "./account"

/** How a connection holds its credential: OAuth tokens it refreshes, or a value the person pasted. */
export const ConnectionMethod = Schema.Literals(["oauth", "secret"]).annotate({ identifier: "ConnectionMethod" })
export type ConnectionMethod = typeof ConnectionMethod.Type

/** `needs_reauth`: the provider refused the refresh token; the account must be connected again. */
export const ConnectionStatus = Schema.Literals(["connected", "needs_reauth"]).annotate({ identifier: "ConnectionStatus" })
export type ConnectionStatus = typeof ConnectionStatus.Type

/**
 * An account connected to a resource: the shared one (`userId` null) or one member's own. Credentials are
 * envelope-encrypted beside it and never leave apps/api; this is everything that may be shown.
 */
export class Connection extends Schema.Opaque<Connection>()(
  Schema.Struct({
    id: ConnectionId,
    orgId: OrgId,
    resourceId: ResourceId,
    mode: AccountMode,
    userId: Schema.NullOr(UserId),
    method: ConnectionMethod,
    status: ConnectionStatus,
    accountIdentity: Schema.NullOr(AccountIdentity),
    connectedBy: ConnectedBy,
    connectedAt: Timestamp,
    refreshedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "Connection" })
) {}

/**
 * How a resource gets its credential, which decides what "connect" means on its page.
 * - `none`: nothing to connect.
 * - `secret_reference`: the shared credential is a `secret` resource an admin picks in the config.
 * - `secret`: each member pastes their own token or API key.
 * - `oauth`: someone signs in at the provider.
 */
export const ConnectMethod = Schema.Literals(["none", "secret_reference", "secret", "oauth"]).annotate({ identifier: "ConnectMethod" })
export type ConnectMethod = typeof ConnectMethod.Type

/** A resource's connection state for the dashboard: the shared account, the caller's own, and what they may do. */
export const ResourceConnections = Schema.Struct({
  resourceId: ResourceId,
  mode: AccountMode,
  method: ConnectMethod,
  shared: Schema.NullOr(Connection),
  mine: Schema.NullOr(Connection),
  /** The caller may switch the mode and connect or disconnect the shared account (`resources:manage`). */
  canManage: Schema.Boolean
}).annotate({ identifier: "ResourceConnections" })
export type ResourceConnections = typeof ResourceConnections.Type

/** A per-user resource the caller can use, with their own connection to it, if any. */
export const MyConnection = Schema.Struct({
  resource: Schema.Struct({ id: ResourceId, name: Name, kind: ResourceKind }),
  method: ConnectMethod,
  connection: Schema.NullOr(Connection)
}).annotate({ identifier: "MyConnection" })
export type MyConnection = typeof MyConnection.Type

/** A pasted token or API key (for `basic` and `custom` integrations, the JSON their secret holds). */
export const ConnectSecret = Schema.Struct({ value: SecretValue }).annotate({ identifier: "ConnectSecret" })
export type ConnectSecret = typeof ConnectSecret.Type

export const SetAccountMode = Schema.Struct({ mode: AccountMode }).annotate({ identifier: "SetAccountMode" })
export type SetAccountMode = typeof SetAccountMode.Type

/**
 * Why an OAuth connection did not complete. The callback sends the browser to the resource page (or, for a
 * per-user connection, the account page) with `?connection=error&reason=<code>`.
 */
export const ConnectionCallbackFailure = Schema.Literals([
  "expired_state",
  "denied",
  "session_mismatch",
  /** The resource was removed, or its auth or mode changed, while the flow was pending. */
  "resource_changed",
  "exchange_failed"
]).annotate({ identifier: "ConnectionCallbackFailure" })
export type ConnectionCallbackFailure = typeof ConnectionCallbackFailure.Type

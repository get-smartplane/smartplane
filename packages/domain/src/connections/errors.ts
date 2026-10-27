import { Schema } from "effect"
import { ResourceId } from "../ids"

/**
 * The resource uses per-user accounts (or a shared OAuth account nobody has connected yet) and the caller's
 * call has no account to go through. `connectUrl` is the dashboard page where the account is connected.
 */
export class AccountNotConnected extends Schema.TaggedError<AccountNotConnected>()(
  "AccountNotConnected",
  { resourceId: ResourceId, resourceName: Schema.String, connectUrl: Schema.String, shared: Schema.Boolean },
  { httpApiStatus: 409 }
) {}

/**
 * An MCP server's OAuth discovery now names another authorization server (`issuer`) or token endpoint than the
 * one pinned for the admin-supplied client. The sign-in is refused before the client is used; an admin must
 * confirm the new server by editing the resource's OAuth settings.
 */
export class AuthorizationServerChanged extends Schema.TaggedError<AuthorizationServerChanged>()(
  "AuthorizationServerChanged",
  { resourceId: ResourceId, field: Schema.Literals(["issuer", "token_endpoint"]), message: Schema.String },
  { httpApiStatus: 409 }
) {}

import { Schema } from "effect"
import { UserId } from "../ids"

/**
 * Whose account a credentialed resource uses. `shared` (the default): one account an admin connects once and
 * everyone granted the resource uses. `per_user`: every member connects their own account.
 */
export const AccountMode = Schema.Literals(["shared", "per_user"]).annotate({ identifier: "AccountMode" })
export type AccountMode = typeof AccountMode.Type

const Label = Schema.String.check(Schema.isMaxLength(320))

/**
 * Who the provider says the connected account is, where it says so (OIDC `id_token` claims, a userinfo or
 * "me" endpoint). Display and guard context only: it is never a credential and never used to authorize.
 */
export const AccountIdentity = Schema.Struct({
  email: Schema.optionalKey(Label),
  username: Schema.optionalKey(Label),
  name: Schema.optionalKey(Label),
  /** The provider's stable id for the account (`sub`). */
  subject: Schema.optionalKey(Label)
}).annotate({ identifier: "AccountIdentity" })
export type AccountIdentity = typeof AccountIdentity.Type

/** The person who connected an account. */
export const ConnectedBy = Schema.Struct({
  userId: UserId,
  email: Schema.NullOr(Schema.String)
}).annotate({ identifier: "ConnectedBy" })
export type ConnectedBy = typeof ConnectedBy.Type

/**
 * The account a call goes through, as guards and audit events see it: the mode, the provider's identity of
 * the account and who connected it. `accountIdentity` is `null` when the provider does not say; for a shared
 * static secret `connectedBy` is `null` too (an admin referenced a secret; nobody signed in).
 */
export const ConnectionContext = Schema.Struct({
  mode: AccountMode,
  accountIdentity: Schema.NullOr(AccountIdentity),
  connectedBy: Schema.NullOr(ConnectedBy)
}).annotate({ identifier: "ConnectionContext" })
export type ConnectionContext = typeof ConnectionContext.Type

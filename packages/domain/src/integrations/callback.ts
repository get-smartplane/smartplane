import { Schema } from "effect"

/**
 * Why an OAuth2 authorization did not end in a connection. The API's callback sends the browser to
 * `<APP_URL>/resources/<id>?integration=error&reason=<code>`; the dashboard decodes `reason` with this schema.
 */
export const IntegrationCallbackFailure = Schema.Literals([
  /** The state was unknown, already used or older than 10 minutes. */
  "expired_state",
  /** The provider sent an error (the person cancelled or refused the consent screen). */
  "denied",
  /** The browser finishing the flow holds no session, or another user's or org's session, than the one that started it. */
  "session_mismatch",
  /** The integration was removed or its OAuth app changed while the flow was pending. */
  "integration_changed",
  /** The token endpoint refused the code exchange. */
  "exchange_failed"
]).annotate({ identifier: "IntegrationCallbackFailure" })
export type IntegrationCallbackFailure = typeof IntegrationCallbackFailure.Type

/** The `integration` query parameter the callback appends: the flow ended connected, or with a `reason`. */
export const IntegrationCallbackOutcome = Schema.Literals(["connected", "error"]).annotate({ identifier: "IntegrationCallbackOutcome" })
export type IntegrationCallbackOutcome = typeof IntegrationCallbackOutcome.Type

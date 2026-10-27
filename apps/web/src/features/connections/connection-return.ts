import { ConnectionCallbackFailure, IntegrationCallbackOutcome } from "@pc/domain"
import { Option, Schema } from "effect"

/** What the connection callback appends: `?connection=connected`, or `?connection=error&reason=…`. Plain strings, decoded below. */
export const ConnectionReturn = Schema.Struct({
  connection: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  resource: Schema.optionalKey(Schema.String)
})
export type ConnectionReturn = typeof ConnectionReturn.Type

const decodeOutcome = Schema.decodeUnknownOption(IntegrationCallbackOutcome)
const decodeFailure = Schema.decodeUnknownOption(ConnectionCallbackFailure)

export const connectionOutcome = (search: ConnectionReturn) => Option.getOrNull(decodeOutcome(search.connection))

const messages: { readonly [K in ConnectionCallbackFailure]: { readonly title: string; readonly description: string } } = {
  expired_state: { title: "The sign-in expired", description: "Each sign-in link works once, for 10 minutes. Connect again to start a fresh one." },
  denied: { title: "Sign-in was cancelled", description: "The provider did not grant access. Connect again and approve the requested access." },
  session_mismatch: { title: "Finished in another session", description: "The sign-in ended in a different Smartplane session than the one that started it. Connect again from this browser." },
  resource_changed: { title: "The resource changed", description: "Its sign-in settings or account mode changed while you were signing in. Connect again." },
  exchange_failed: { title: "The provider refused the sign-in", description: "Check the OAuth client and its redirect URI, then connect again." }
}

/** One explanation per known failure; anything else reads as a generic failure. */
export const connectionFailure = (reason: string | undefined) =>
  Option.match(decodeFailure(reason), {
    onSome: (known) => messages[known],
    onNone: () => ({ title: "Could not connect", description: "Something went wrong while connecting. Try again." })
  })

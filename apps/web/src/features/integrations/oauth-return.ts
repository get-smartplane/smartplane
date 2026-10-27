import { IntegrationCallbackFailure, IntegrationCallbackOutcome } from "@pc/domain"
import { Option, Schema } from "effect"

/**
 * Where the API's OAuth callback sends the browser: `?integration=connected`, or `?integration=error&reason=…`.
 * The route keeps both as plain strings so an unexpected value never breaks the page; `callbackOutcome` and
 * `oauthFailure` decode them against the shared domain literals.
 */
export const OAuthReturn = Schema.Struct({
  integration: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String)
})
export type OAuthReturn = typeof OAuthReturn.Type

const decodeOutcome = Schema.decodeUnknownOption(IntegrationCallbackOutcome)
const decodeFailure = Schema.decodeUnknownOption(IntegrationCallbackFailure)

/** `connected`, `error`, or null when the page was opened without a callback (or with a value the API never sends). */
export const callbackOutcome = (search: OAuthReturn): IntegrationCallbackOutcome | null => Option.getOrNull(decodeOutcome(search.integration))

export interface OAuthFailure {
  readonly title: string
  readonly description: string
}

const describe = (reason: IntegrationCallbackFailure, provider: string): OAuthFailure => {
  switch (reason) {
    case "expired_state":
      return { title: "The sign-in expired", description: "Each sign-in link works once, for 10 minutes. Reconnect to start a fresh one." }
    case "denied":
      return { title: "Sign-in was cancelled", description: `${provider} did not grant access. Reconnect and approve the requested access on ${provider}'s consent screen.` }
    case "session_mismatch":
      return { title: "Finished in another session", description: "The sign-in ended in a different Smartplane session than the one that started it. Reconnect from this browser while signed in as yourself." }
    case "integration_changed":
      return { title: "The OAuth app changed", description: "The client ID or secret changed, or the integration was removed, while you were signing in. Reconnect to use the current OAuth app." }
    case "exchange_failed":
      return { title: `${provider} refused the sign-in`, description: "Check the client ID and client secret, and that the redirect URI on the OAuth app matches exactly. Then reconnect." }
  }
}

/** One plain explanation and next step per `IntegrationCallbackFailure`; anything else reads as a generic failure. */
export const oauthFailure = (reason: string | undefined, provider: string): OAuthFailure =>
  Option.match(decodeFailure(reason), {
    onSome: (known) => describe(known, provider),
    onNone: () => ({ title: "Could not connect", description: "Something went wrong while connecting. Reconnect to try again." })
  })

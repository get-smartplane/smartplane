import { DateTime, Effect, Redacted, Stdio } from "effect"
import { Command, Flag } from "effect/cli"
import { makeApi } from "../../api/client"
import { currentTarget, type Target } from "../../api/session"
import { openBrowser } from "../../app/browser"
import { authFailure } from "../../app/failure"
import { emit, note } from "../../app/output"
import { readSecret } from "../../app/secret-input"
import { Credentials } from "../../config/credentials"
import { describeIdentity, Identity, identityOf, principalLabel } from "./identity"

const noBrowser = Flag.Boolean("no-browser").pipe(Flag.withDescription("Print the token page URL instead of opening it"), Flag.withDefault(false))

/**
 * Paste-token login: the dashboard mints the token (so SSO, MFA and the 90-day limit all apply), the CLI only
 * checks it against `/api/me` and keeps it in a 0600 credentials file.
 */
/** The paste-token flow, shared with `init`: checks the token against `/api/me`, then saves it to the profile. */
export const pasteTokenLogin = (target: Target, options: { readonly browser: boolean }) =>
  Effect.gen(function*() {
    if (yield* (yield* Stdio.Stdio).stdinIsTerminal) {
      const url = `${target.apiUrl}/tokens`
      yield* note(`Create a personal access token at ${url} and paste it below.`)
      if (options.browser) yield* openBrowser(url)
    }
    const token = yield* readSecret("Access token")
    if (!Redacted.value(token).startsWith("pc_")) return yield* authFailure("That is not a Smartplane access token (they start with pc_).")
    const me = yield* (yield* makeApi(target.apiUrl, token)).me.get()
    yield* (yield* Credentials).save(target.profile, {
      apiUrl: target.apiUrl,
      token,
      org: me.org.name,
      identity: principalLabel(me.principal),
      savedAt: DateTime.formatIso(yield* DateTime.now)
    })
    yield* note(`Logged in to ${me.org.name} as ${principalLabel(me.principal)} (profile "${target.profile}").`)
    return { me, token }
  })

export const login = Command.make("login", { noBrowser }, ({ noBrowser }) =>
  Effect.gen(function*() {
    const target = yield* currentTarget
    const { me } = yield* pasteTokenLogin(target, { browser: !noBrowser })
    yield* emit(Identity, identityOf(me, { profile: target.profile, apiUrl: target.apiUrl, source: "profile" }), describeIdentity)
  })).pipe(
    Command.withDescription("Log in with an access token created in the dashboard"),
    Command.withExamples([
      { command: "smartplane login", description: "Open the token page, then paste the token" },
      { command: "smartplane login --profile staging --api-url https://smartplane.internal", description: "Log in to a self-hosted instance" },
      { command: "echo \"$TOKEN\" | smartplane login", description: "Read the token from stdin" }
    ])
  )

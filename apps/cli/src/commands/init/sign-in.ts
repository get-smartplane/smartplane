import type { Me } from "@pc/domain"
import { Effect, Option, Redacted } from "effect"
import { makeApi } from "../../api/client"
import { currentTarget, type Session } from "../../api/session"
import type { Questions } from "../../app/ask"
import { authFailure } from "../../app/failure"
import { Host } from "../../app/host"
import { note } from "../../app/output"
import { pasteTokenLogin } from "../auth/login"
import { principalLabel } from "../auth/identity"
import { step, type Step } from "./report"

export interface SignedIn {
  readonly session: Session
  readonly me: Me
  readonly step: Step
}

const signedInAs = (me: Me, session: Session) =>
  `Signed in as ${principalLabel(me.principal)} in ${me.org.name}${session.source === "env" ? " (SMARTPLANE_TOKEN)" : ` (profile "${session.profile}")`}`

/**
 * Reuses a working login (SMARTPLANE_TOKEN first, then the profile). A saved login the API no longer accepts
 * is replaced by the paste-token flow when someone is there to paste; otherwise init stops here.
 */
export const signIn = (q: Questions) =>
  Effect.gen(function*() {
    const target = yield* currentTarget
    const fromEnv = (yield* Host).env("SMARTPLANE_TOKEN")
    const existing: Option.Option<Session> = fromEnv !== undefined
      ? Option.some({ ...target, token: Redacted.make(fromEnv), source: "env" })
      : Option.map(target.saved, (profile) => ({ ...target, token: profile.token, source: "profile" }))
    if (Option.isSome(existing)) {
      const session = existing.value
      const checked = yield* Effect.result(Effect.flatMap(makeApi(session.apiUrl, session.token), (client) => client.me.get()))
      if (checked._tag === "Success") {
        yield* note(`✓ ${signedInAs(checked.success, session)}.`)
        return { session, me: checked.success, step: step("sign-in", "unchanged", signedInAs(checked.success, session)) } satisfies SignedIn
      }
      if (checked.failure._tag !== "Unauthorized" || session.source === "env" || !q.live) return yield* checked.failure
      yield* note("Your saved login is no longer accepted; log in again.")
    }
    if (!q.live) return yield* authFailure(`Not logged in (profile "${target.profile}").`, "Run `smartplane login` first, or set SMARTPLANE_TOKEN.")
    const { me, token } = yield* pasteTokenLogin(target, { browser: true })
    const session: Session = { ...target, token, source: "profile" }
    return { session, me, step: step("sign-in", "done", signedInAs(me, session)) } satisfies SignedIn
  })

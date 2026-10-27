import { Effect, Option, Redacted, Schema } from "effect"
import { HttpUrl } from "@pc/domain"
import { authFailure, usageFailure } from "../app/failure"
import { Host } from "../app/host"
import { ApiUrlOverride, ProfileName } from "../app/settings"
import { Credentials, type Profile } from "../config/credentials"

export const DefaultApiUrl = "https://app.smartplane.dev"

/** Where commands talk to, before any token is involved: `login` and `connect` need only this. */
export interface Target {
  readonly profile: string
  readonly apiUrl: string
  readonly saved: Option.Option<Profile>
}

export type TokenSource = "env" | "profile"

export interface Session extends Target {
  readonly token: Redacted.Redacted<string>
  readonly source: TokenSource
}

const isHttpUrl = Schema.is(HttpUrl)

export const normalizeApiUrl = (raw: string) => {
  const url = raw.trim().replace(/\/+$/, "")
  return isHttpUrl(url) ? Effect.succeed(url) : Effect.fail(usageFailure(`Not an http(s) URL: ${raw}`))
}

/** Precedence: flags, then SMARTPLANE_* variables, then the saved profile, then the hosted default. */
export const currentTarget = Effect.gen(function*() {
  const host = yield* Host
  const credentials = yield* Credentials
  const profile = Option.getOrElse(yield* ProfileName, () => host.env("SMARTPLANE_PROFILE") ?? "default")
  const saved = yield* credentials.profile(profile)
  const raw = Option.getOrUndefined(yield* ApiUrlOverride) ?? host.env("SMARTPLANE_API_URL") ??
    Option.match(saved, { onNone: () => DefaultApiUrl, onSome: (p) => p.apiUrl })
  return { profile, apiUrl: yield* normalizeApiUrl(raw), saved } satisfies Target
})

/** SMARTPLANE_TOKEN wins over a saved login, so CI never depends on a credentials file. */
export const currentSession = Effect.gen(function*() {
  const target = yield* currentTarget
  const fromEnv = (yield* Host).env("SMARTPLANE_TOKEN")
  if (fromEnv !== undefined) return { ...target, token: Redacted.make(fromEnv), source: "env" } satisfies Session
  if (Option.isSome(target.saved)) {
    return { ...target, token: target.saved.value.token, source: "profile" } satisfies Session
  }
  return yield* authFailure(`Not logged in (profile "${target.profile}").`)
})

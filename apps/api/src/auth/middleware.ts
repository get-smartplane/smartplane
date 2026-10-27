import { Authentication, CurrentPrincipal, CurrentUser, SessionAuthentication, Unauthorized } from "@pc/domain"
import { Effect, Layer, Option, Redacted } from "effect"
import { HttpServerRequest } from "effect/http"
import { TokenAuthenticator } from "../access/token-auth"
import { AppConfig } from "../platform/config"
import { setSessionCookieOnResponse } from "./session-cookie"
import { Principals } from "./principals"
import { UsersRepo } from "./users-repo"
import { WorkOS } from "./workos"

const missing = new Unauthorized({ reason: "missing_credentials" })
const isEmpty = (credential: Redacted.Redacted<string>) => Redacted.value(credential) === ""

/**
 * Schemes run in order (session, then bearer) and the last failure is what the client sees. A dashboard
 * user whose session is valid but has no org must get `no_organization`, not the bearer scheme's
 * `missing_credentials`, so the session outcome is remembered per request.
 */
const sessionFailures = new WeakMap<HttpServerRequest.HttpServerRequest, Unauthorized>()

const annotate = (attributes: Record<string, unknown>) => Effect.annotateCurrentSpan(attributes)

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function*() {
    const workos = yield* WorkOS
    const config = yield* AppConfig
    const principals = yield* Principals
    const tokens = yield* TokenAuthenticator

    return Authentication.of({
      session: Effect.fn("Authentication.session")(function*(httpEffect, { credential }) {
        if (isEmpty(credential)) return yield* missing
        const request = yield* HttpServerRequest.HttpServerRequest
        const outcome = yield* Effect.gen(function*() {
          const session = yield* workos.authenticate(credential)
          if (session.refreshed !== undefined) yield* setSessionCookieOnResponse(config, session.refreshed)
          return yield* principals.forSession(session.user.id, session.organizationId)
        }).pipe(Effect.tapError((failure) => Effect.sync(() => sessionFailures.set(request, failure))))
        yield* annotate({ "org.id": outcome.orgId, "principal.kind": "session" })
        return yield* Effect.provideService(httpEffect, CurrentPrincipal, outcome)
      }),
      bearer: Effect.fn("Authentication.bearer")(function*(httpEffect, { credential }) {
        if (isEmpty(credential)) {
          const request = yield* HttpServerRequest.HttpServerRequest
          return yield* (sessionFailures.get(request) ?? missing)
        }
        const principal = yield* tokens.authenticate(credential)
        yield* annotate({ "org.id": principal.orgId, "principal.kind": principal._tag })
        return yield* Effect.provideService(httpEffect, CurrentPrincipal, principal)
      })
    })
  })
)

/** Onboarding: any signed-in, mirrored, non-deprovisioned user, with or without an org. */
export const SessionAuthenticationLive = Layer.effect(
  SessionAuthentication,
  Effect.gen(function*() {
    const workos = yield* WorkOS
    const config = yield* AppConfig
    const users = yield* UsersRepo

    return SessionAuthentication.of({
      session: Effect.fn("SessionAuthentication.session")(function*(httpEffect, { credential }) {
        if (isEmpty(credential)) return yield* missing
        const session = yield* workos.authenticate(credential)
        if (session.refreshed !== undefined) yield* setSessionCookieOnResponse(config, session.refreshed)
        const user = yield* users.findByWorkosId(session.user.id)
        if (Option.isNone(user)) return yield* new Unauthorized({ reason: "invalid_credentials" })
        if (user.value.status !== "active") return yield* new Unauthorized({ reason: "deprovisioned" })
        return yield* Effect.provideService(httpEffect, CurrentUser, {
          userId: user.value.id,
          email: session.user.email,
          name: [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") || null
        })
      })
    })
  })
)

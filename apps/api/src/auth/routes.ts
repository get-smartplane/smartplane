import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AppConfig } from "../platform/config"
import { newLoginState, readLoginState, sameLoginState, withLoginState, withoutLoginState } from "./login-state"
import { readSession, withoutSessionCookie, withSessionCookie } from "./session-cookie"
import { SignIn } from "./sign-in"
import { WorkOS } from "./workos"

const LoginQuery = Schema.Struct({ signup: Schema.optional(Schema.String), org: Schema.optional(Schema.String) })
const CallbackQuery = Schema.Struct({ code: Schema.NonEmptyString, state: Schema.optional(Schema.String) })

/** AuthKit's hosted UI handles sign-in, sign-up, SSO, MFA and social login. */
const login = HttpRouter.add("GET", "/auth/login", Effect.gen(function*() {
  const workos = yield* WorkOS
  const config = yield* AppConfig
  const query = yield* HttpServerRequest.schemaSearchParams(LoginQuery).pipe(Effect.orElseSucceed(() => ({ signup: undefined, org: undefined })))
  const state = yield* newLoginState
  const url = workos.authorizationUrl({ signUp: query.signup !== undefined, organizationId: query.org, state })
  return yield* withLoginState(config, state)(HttpServerResponse.redirect(url))
}).pipe(Effect.withSpan("auth.login")))

const callback = HttpRouter.add("GET", "/auth/callback", Effect.gen(function*() {
  const config = yield* AppConfig
  const failed = (error: string) => withoutLoginState(config)(HttpServerResponse.redirect(`${config.APP_URL}/login?error=${error}`))
  const query = yield* Effect.option(HttpServerRequest.schemaSearchParams(CallbackQuery))
  if (Option.isNone(query)) return yield* failed("missing_code")
  // Checked before the code is exchanged: a callback this browser did not start never signs it in.
  if (!sameLoginState(yield* readLoginState, query.value.state)) {
    yield* Effect.logWarning("auth.callback: sign-in state mismatch")
    return yield* failed("sign_in_failed")
  }
  const exchange = yield* WorkOS.use((workos) => workos.exchangeCode(query.value.code)).pipe(
    // WorkOS's error says why (wrong API key, redirect URI, expired code); without it a failed sign-in is invisible.
    Effect.tapError((error) => Effect.logWarning("auth.callback: code exchange failed", error._tag, error.message)),
    Effect.option
  )
  if (Option.isNone(exchange)) return yield* failed("sign_in_failed")
  const org = yield* SignIn.use((signIn) => signIn.complete(exchange.value))
  const destination = Option.isSome(org) ? config.APP_URL : `${config.APP_URL}/onboarding`
  const signedIn = yield* withSessionCookie(config, exchange.value.sealedSession)(HttpServerResponse.redirect(destination))
  return yield* withoutLoginState(config)(signedIn)
}).pipe(Effect.withSpan("auth.callback")))

/** Returns where the browser should go next (the WorkOS logout URL ends the AuthKit session too). */
const logout = HttpRouter.add("POST", "/auth/logout", Effect.gen(function*() {
  const config = yield* AppConfig
  const sealed = yield* readSession
  const redirect = sealed === undefined ? config.APP_URL : yield* WorkOS.use((workos) => workos.logoutUrl(sealed))
  return yield* withoutSessionCookie(config)(HttpServerResponse.jsonUnsafe({ redirect }))
}).pipe(Effect.withSpan("auth.logout")))

export const AuthRoutes = Layer.mergeAll(login, callback, logout)

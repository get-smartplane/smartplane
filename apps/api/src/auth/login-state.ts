import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import type { EnvConfig } from "../platform/config"
import { randomHex } from "../platform/encoding"

/**
 * Login CSRF: the AuthKit `state` is bound to the browser that started sign-in through this cookie, so an
 * attacker cannot hand a victim a callback URL carrying the attacker's own authorization code.
 */
export const LoginStateCookie = "pc_login_state"
const LoginStateMaxAge = "10 minutes"

const options = (config: EnvConfig) => ({
  path: "/auth",
  httpOnly: true,
  secure: config.API_URL.startsWith("https://"),
  // Lax: the callback is a top-level GET navigation from WorkOS, which Lax cookies accompany.
  sameSite: "lax" as const
})

export const newLoginState = Effect.sync(() => randomHex(32))

export const readLoginState = HttpServerRequest.HttpServerRequest.useSync((request) => {
  const value = request.cookies[LoginStateCookie]
  return value === undefined || value === "" ? undefined : value
})

export const withLoginState = (config: EnvConfig, state: string) => (response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.setCookie(response, LoginStateCookie, state, { ...options(config), maxAge: LoginStateMaxAge }).pipe(Effect.orDie)

export const withoutLoginState = (config: EnvConfig) => (response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.expireCookie(response, LoginStateCookie, options(config)).pipe(Effect.orDie)

/** Constant-time, so response timing does not reveal how much of a guessed state matched. */
export const sameLoginState = (expected: string | undefined, received: string | undefined): boolean => {
  if (expected === undefined || received === undefined || expected.length === 0 || expected.length !== received.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index)
  return difference === 0
}

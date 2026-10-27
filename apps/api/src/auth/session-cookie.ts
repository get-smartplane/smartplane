import { SessionCookie } from "@pc/domain"
import { Effect, Redacted } from "effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/http"
import type { EnvConfig } from "../platform/config"

const SessionMaxAge = "7 days"

const options = (config: EnvConfig) => ({
  path: "/",
  httpOnly: true,
  secure: config.API_URL.startsWith("https://"),
  sameSite: "lax" as const
})

/** The sealed WorkOS session from the request, if any. */
export const readSession = HttpServerRequest.HttpServerRequest.useSync((request) => {
  const value = request.cookies[SessionCookie]
  return value === undefined || value === "" ? undefined : Redacted.make(value)
})

export const withSessionCookie = (config: EnvConfig, sealed: Redacted.Redacted<string>) =>
(response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.setCookie(response, SessionCookie, Redacted.value(sealed), { ...options(config), maxAge: SessionMaxAge }).pipe(
    Effect.orDie
  )

export const withoutSessionCookie = (config: EnvConfig) => (response: HttpServerResponse.HttpServerResponse) =>
  HttpServerResponse.expireCookie(response, SessionCookie, options(config)).pipe(Effect.orDie)

/** Re-sets the cookie on whatever response the current request ends up producing (e.g. after a refresh). */
export const setSessionCookieOnResponse = (config: EnvConfig, sealed: Redacted.Redacted<string>) =>
  HttpEffect.appendPreResponseHandler((_request, response) => withSessionCookie(config, sealed)(response))

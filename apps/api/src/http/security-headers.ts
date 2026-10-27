import { Effect } from "effect"
import { HttpEffect, HttpRouter, HttpServerResponse } from "effect/http"

/**
 * Sent on every API response, errors and 404s included (a pre-response handler runs after errors become
 * responses). The API shares the dashboard's hostname, so HSTS here covers the whole origin; the API serves
 * JSON and redirects only, so nosniff and a strict referrer policy cost nothing.
 */
export const securityHeaders: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
}

export const SecurityHeaders = HttpRouter.middleware(
  (httpEffect) =>
    Effect.andThen(
      HttpEffect.appendPreResponseHandler((_request, response) => Effect.succeed(HttpServerResponse.setHeaders(response, securityHeaders))),
      httpEffect
    ),
  { global: true }
)

/**
 * Every failure is a `SmartplaneError`. Messages are written by this library and never include the token; any
 * text taken from a server reply is passed through `redact` first.
 */
export class SmartplaneError extends Error {
  override readonly name: string = "SmartplaneError"
  constructor(
    message: string,
    /** The HTTP status, when the server answered. */
    readonly status?: number,
    options?: { readonly cause?: unknown }
  ) {
    super(message, options)
  }
}

/** 401, or no token at all: set SMARTPLANE_TOKEN or pass `token`. Not retried. */
export class UnauthorizedError extends SmartplaneError {
  override readonly name = "UnauthorizedError"
}

/** 403: the token may not receive these values. Not retried. */
export class ForbiddenError extends SmartplaneError {
  override readonly name = "ForbiddenError"
}

/** 429 after every retry. `retryAfterMs` is the server's last Retry-After. */
export class RateLimitedError extends SmartplaneError {
  override readonly name = "RateLimitedError"
  constructor(message: string, readonly retryAfterMs: number) {
    super(message, 429)
  }
}

/** The API could not be reached, timed out, or answered 5xx, after every retry. */
export class NetworkError extends SmartplaneError {
  override readonly name = "NetworkError"
}

/** The reply was not the delivery shape this version understands (or the request was rejected as invalid). */
export class InvalidResponseError extends SmartplaneError {
  override readonly name = "InvalidResponseError"
}

/** Removes the token from text that came from elsewhere, in case a server or proxy ever echoes it. */
export const redact = (text: string, token: string) => (token.length === 0 ? text : text.split(token).join("[redacted]"))

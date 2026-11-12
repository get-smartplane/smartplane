import { Unauthorized, UpstreamFailure } from "@pc/domain"
import { Effect, Predicate, Redacted } from "effect"

/** The parts of a WorkOS `CookieSession` we use, so the failure mapping is testable without the SDK. */
export interface SessionLike {
  readonly authenticate: () => Promise<
    | { readonly authenticated: true; readonly user: unknown; readonly organizationId?: string | undefined }
    | { readonly authenticated: false; readonly reason: string }
  >
  readonly refresh: () => Promise<
    | { readonly authenticated: true; readonly user: unknown; readonly organizationId?: string | undefined; readonly sealedSession?: string | undefined }
    | { readonly authenticated: false; readonly reason: string; readonly retryable?: boolean }
  >
}

const statusOf = (cause: unknown): number | undefined =>
  Predicate.hasProperty(cause, "status") && Predicate.isNumber(cause.status) ? cause.status : undefined

const codeOf = (cause: unknown): string | undefined =>
  Predicate.hasProperty(cause, "code") && Predicate.isString(cause.code) ? cause.code : undefined

/**
 * Whether a thrown SDK error means WorkOS (or the way to it) is unavailable rather than that the session was
 * rejected: network failures, timeouts, rate limits, 5xx, and a JWKS that could not be fetched. Everything
 * else (a malformed cookie, `invalid_grant`, a bad signature) is a real rejection.
 */
export const isTransient = (cause: unknown): boolean => {
  if (cause instanceof TypeError || (cause instanceof Error && cause.cause instanceof TypeError)) return true
  if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) return true
  const status = statusOf(cause)
  if (status !== undefined) return status >= 500 || status === 408 || status === 429
  // jose: JWKS fetch timed out, or answered with something other than 200 OK.
  const code = codeOf(cause)
  return code === "ERR_JWKS_TIMEOUT" || code === "ERR_JOSE_GENERIC"
}

/** Shown on the dashboard; the operation and error kind go to the logs only. */
const unavailable = (operation: string, cause: unknown) =>
  Effect.as(
    Effect.logWarning("WorkOS unavailable", { operation, error: cause instanceof Error ? cause.name : "unknown" }),
    new UpstreamFailure({ upstream: "Sign-in service", message: "We could not check your session right now. Try again in a moment." })
  )

/** A WorkOS outage is `UpstreamFailure` (502, the dashboard shows an error); only a rejected session is `Unauthorized`. */
export const classify = (operation: string, cause: unknown): Effect.Effect<never, Unauthorized | UpstreamFailure> =>
  isTransient(cause) ? Effect.flatMap(unavailable(operation, cause), Effect.fail) : Effect.fail(new Unauthorized({ reason: "invalid_credentials" }))

const attempt = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => cause }).pipe(Effect.catch((cause) => classify(operation, cause)))

export interface AuthenticatedSession {
  readonly user: unknown
  readonly organizationId: string | undefined
  readonly refreshed: Redacted.Redacted<string> | undefined
}

/** Authenticates a sealed session, refreshing an expired access token transparently. */
export const authenticateSession = Effect.fnUntraced(function*(session: SessionLike) {
  const current = yield* attempt("authenticate", () => session.authenticate())
  if (current.authenticated) return { user: current.user, organizationId: current.organizationId, refreshed: undefined } satisfies AuthenticatedSession
  const refreshed = yield* attempt("refresh", () => session.refresh())
  if (!refreshed.authenticated) {
    // The SDK reports timeouts, rate limits, 5xx and network errors as retryable: WorkOS is down, the session may be fine.
    if (refreshed.retryable === true) return yield* Effect.flatMap(unavailable("refresh", new Error(refreshed.reason)), Effect.fail)
    return yield* new Unauthorized({ reason: "expired" })
  }
  if (refreshed.sealedSession === undefined) return yield* new Unauthorized({ reason: "expired" })
  return { user: refreshed.user, organizationId: refreshed.organizationId, refreshed: Redacted.make(refreshed.sealedSession) } satisfies AuthenticatedSession
})

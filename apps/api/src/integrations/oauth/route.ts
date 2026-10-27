import type { Principal } from "@pc/domain"
import { Effect, Option } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { Principals } from "../../auth/principals"
import { readSession } from "../../auth/session-cookie"
import { WorkOS } from "../../auth/workos"
import { CallbackQuery, OAuthCallback } from "./callback"
import { callbackPath } from "./flow"

/** The dashboard session in this browser, if any; the callback only completes flows its own user started. */
export const sessionPrincipal: Effect.Effect<Option.Option<Principal>, never, WorkOS | Principals | HttpServerRequest.HttpServerRequest> =
  Effect.gen(function*() {
    const sealed = yield* readSession
    if (sealed === undefined) return Option.none()
    const session = yield* WorkOS.use((workos) => workos.authenticate(sealed))
    return Option.some(yield* Principals.use((principals) => principals.forSession(session.user.id, session.organizationId)))
  }).pipe(Effect.orElseSucceed(() => Option.none()))

/**
 * Where providers redirect after authorization. A plain route (not part of `PrimitiveApi`): it answers the
 * browser with a redirect to the dashboard, never with JSON.
 */
export const IntegrationOAuthRoutes = HttpRouter.add("GET", callbackPath, Effect.gen(function*() {
  const query = yield* HttpServerRequest.schemaSearchParams(CallbackQuery).pipe(Effect.orElseSucceed(() => ({})))
  const session = yield* sessionPrincipal
  const destination = yield* OAuthCallback.use((callback) => callback.complete(query, session))
  return HttpServerResponse.redirect(destination)
}).pipe(Effect.withSpan("integrations.oauth.callback")))

import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { CallbackQuery } from "../../integrations/oauth/callback"
import { sessionPrincipal } from "../../integrations/oauth/route"
import { ConnectionCallback } from "./callback"
import { connectionCallbackPath } from "./start"

/** Where authorization servers redirect after a connection sign-in; answers with a redirect to the dashboard. */
export const ConnectionOAuthRoutes = HttpRouter.add("GET", connectionCallbackPath, Effect.gen(function*() {
  const query = yield* HttpServerRequest.schemaSearchParams(CallbackQuery).pipe(Effect.orElseSucceed(() => ({})))
  const session = yield* sessionPrincipal
  const destination = yield* ConnectionCallback.use((callback) => callback.complete(query, session))
  return HttpServerResponse.redirect(destination)
}).pipe(Effect.withSpan("connections.oauth.callback")))

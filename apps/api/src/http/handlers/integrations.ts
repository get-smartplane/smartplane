import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { IntegrationCatalog } from "../../integrations/catalog"
import { IntegrationOAuth } from "../../integrations/oauth/flow"

export const IntegrationsHandlers = HttpApiBuilder.group(PrimitiveApi, "integrations", Effect.fn(function*(handlers) {
  const catalog = yield* IntegrationCatalog
  const oauth = yield* IntegrationOAuth
  return handlers
    .handle("listCatalog", ({ query }) => CurrentPrincipal.use((principal) => catalog.list(principal, query)))
    .handle("getPiece", ({ params }) => CurrentPrincipal.use((principal) => catalog.get(principal, params.pieceId)))
    .handle("oauthSettings", () => CurrentPrincipal.use((principal) => oauth.settings(principal)))
    .handle("startOAuth", ({ params, query }) => CurrentPrincipal.use((principal) => oauth.start(principal, params.id, query.returnTo)))
    .handle("disconnectOAuth", ({ params }) => CurrentPrincipal.use((principal) => oauth.disconnect(principal, params.id)))
}))

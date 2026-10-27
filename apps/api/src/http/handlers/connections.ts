import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Connections } from "../../connections/connections"

export const ConnectionsHandlers = HttpApiBuilder.group(PrimitiveApi, "connections", Effect.fn(function*(handlers) {
  const connections = yield* Connections
  return handlers
    .handle("oauthSettings", () => CurrentPrincipal.use((principal) => connections.oauthSettings(principal)))
    .handle("mine", () => CurrentPrincipal.use((principal) => connections.mine(principal)))
    .handle("forResource", ({ params }) => CurrentPrincipal.use((principal) => connections.forResource(principal, params.id)))
    .handle("setMode", ({ params, payload }) => CurrentPrincipal.use((principal) => connections.setMode(principal, params.id, payload)))
    .handle("startOAuth", ({ params }) => CurrentPrincipal.use((principal) => connections.startOAuth(principal, params.id)))
    .handle("connectSecret", ({ params, payload }) => CurrentPrincipal.use((principal) => connections.connectSecret(principal, params.id, payload)))
    .handle("disconnect", ({ params }) => CurrentPrincipal.use((principal) => connections.disconnect(principal, params.id)))
}))

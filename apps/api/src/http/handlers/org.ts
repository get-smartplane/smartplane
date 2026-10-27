import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { OrgSettings } from "../../settings/org-settings"

export const OrgHandlers = HttpApiBuilder.group(PrimitiveApi, "org", Effect.fn(function*(handlers) {
  const settings = yield* OrgSettings
  return handlers
    .handle("get", () => CurrentPrincipal.use((principal) => settings.get(principal)))
    .handle("update", ({ payload }) => CurrentPrincipal.use((principal) => settings.update(principal, payload)))
    .handle("adminPortalLink", ({ payload }) => CurrentPrincipal.use((principal) => settings.adminPortalLink(principal, payload.intent)))
}))

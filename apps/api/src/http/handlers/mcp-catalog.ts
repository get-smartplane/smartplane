import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { McpCatalog } from "../../mcp-catalog/mcp-catalog"

export const McpCatalogHandlers = HttpApiBuilder.group(PrimitiveApi, "mcpCatalog", Effect.fn(function*(handlers) {
  const catalog = yield* McpCatalog
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => catalog.list(principal)))
    .handle("connect", ({ params, payload }) => CurrentPrincipal.use((principal) => catalog.connect(principal, params.slug, payload)))
}))

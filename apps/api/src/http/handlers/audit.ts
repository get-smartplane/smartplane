import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { AuditReader } from "../../audit/audit-reader"

export const AuditHandlers = HttpApiBuilder.group(PrimitiveApi, "audit", Effect.fn(function*(handlers) {
  const reader = yield* AuditReader
  return handlers
    .handle("list", ({ query }) => CurrentPrincipal.use((principal) => reader.list(principal, query)))
    .handle("deliveries", () => CurrentPrincipal.use((principal) => reader.deliveries(principal)))
    .handle("verify", ({ query }) => CurrentPrincipal.use((principal) => reader.verify(principal, query.fromSeq ?? 1)))
    .handle("export", ({ query }) => CurrentPrincipal.use((principal) => reader.export(principal, query)))
}))

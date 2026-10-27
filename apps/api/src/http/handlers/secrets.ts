import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { KeyRotation } from "../../secrets/key-rotation"
import { SecretStatuses } from "../../secrets/secret-statuses"

export const SecretsHandlers = HttpApiBuilder.group(PrimitiveApi, "secrets", Effect.fn(function*(handlers) {
  const rotation = yield* KeyRotation
  const statuses = yield* SecretStatuses
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => statuses.list(principal)))
    .handle("rewrap", () => CurrentPrincipal.use((principal) => rotation.rewrapFor(principal)))
}))

import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { OrgsRepo } from "../../org/orgs-repo"

export const MeHandlers = HttpApiBuilder.group(PrimitiveApi, "me", Effect.fn(function*(handlers) {
  const orgs = yield* OrgsRepo
  return handlers.handle("get", () =>
    Effect.gen(function*() {
      const principal = yield* CurrentPrincipal
      // The principal was just resolved from this org, so a missing row is a defect.
      const org = yield* Effect.orDie(Effect.fromOption(yield* orgs.find(principal.orgId)))
      return { principal, org }
    }))
}))

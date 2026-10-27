import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Teams } from "../../org/teams"

export const TeamsHandlers = HttpApiBuilder.group(PrimitiveApi, "teams", Effect.fn(function*(handlers) {
  const teams = yield* Teams
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => teams.list(principal)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => teams.create(principal, payload.name)))
    .handle("update", ({ params, payload }) => CurrentPrincipal.use((principal) => teams.rename(principal, params.id, payload.name)))
    .handle("remove", ({ params }) => CurrentPrincipal.use((principal) => teams.remove(principal, params.id)))
    .handle("listMembers", ({ params }) => CurrentPrincipal.use((principal) => teams.members(principal, params.id)))
    .handle("addMember", ({ params, payload }) => CurrentPrincipal.use((principal) => teams.addMember(principal, params.id, payload.userId)))
    .handle("removeMember", ({ params }) => CurrentPrincipal.use((principal) => teams.removeMember(principal, params.id, params.userId)))
}))

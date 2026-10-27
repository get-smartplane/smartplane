import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Guards } from "../../guards/guards"
import { GuardPins } from "../../guards/pinning/pins"
import { GuardStarters } from "../../guards/starters/starters"
import { GuardTestCalls } from "../../guards/test-calls"

export const GuardsHandlers = HttpApiBuilder.group(PrimitiveApi, "guards", Effect.fn(function*(handlers) {
  const guards = yield* Guards
  const testCalls = yield* GuardTestCalls
  const pins = yield* GuardPins
  const starters = yield* GuardStarters
  return handlers
    .handle("list", () => CurrentPrincipal.use((principal) => guards.list(principal)))
    .handle("create", ({ payload }) => CurrentPrincipal.use((principal) => guards.create(principal, payload)))
    .handle("createFromStarter", ({ payload }) => CurrentPrincipal.use((principal) => starters.create(principal, payload)))
    .handle("get", ({ params }) => CurrentPrincipal.use((principal) => guards.get(principal, params.id)))
    .handle("compile", ({ params }) => CurrentPrincipal.use((principal) => guards.compile(principal, params.id)))
    .handle("cancelVerify", ({ params }) => CurrentPrincipal.use((principal) => guards.cancelVerify(principal, params.id)))
    .handle("continueVerify", ({ params }) => CurrentPrincipal.use((principal) => guards.continueVerify(principal, params.id)))
    .handle("test", ({ params, payload }) => CurrentPrincipal.use((principal) => guards.test(principal, params.id, payload)))
    .handle("addTestCall", ({ params, payload }) => CurrentPrincipal.use((principal) => testCalls.add(principal, params.id, payload)))
    .handle("removeTestCall", ({ params }) => CurrentPrincipal.use((principal) => testCalls.remove(principal, params.id, params.callId)))
    .handle("confirmPin", ({ params, payload }) => CurrentPrincipal.use((principal) => pins.confirm(principal, params.id, payload)))
    .handle("dismissPins", ({ params }) => CurrentPrincipal.use((principal) => pins.dismiss(principal, params.id)))
    .handle("unpin", ({ params }) => CurrentPrincipal.use((principal) => pins.unpin(principal, params.id, params.pinId)))
    .handle("pinStats", ({ params }) => CurrentPrincipal.use((principal) => pins.stats(principal, params.id)))
    .handle("update", ({ params, payload }) => CurrentPrincipal.use((principal) => guards.update(principal, params.id, payload)))
}))

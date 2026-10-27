import { CurrentPrincipal, PrimitiveApi } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { SetupProgress } from "../../org/setup-progress"

export const OnboardingProgressHandlers = HttpApiBuilder.group(PrimitiveApi, "onboardingProgress", Effect.fn(function*(handlers) {
  const progress = yield* SetupProgress
  return handlers
    .handle("get", () => CurrentPrincipal.use((principal) => progress.get(principal)))
    .handle("updateSetup", ({ payload }) => CurrentPrincipal.use((principal) => progress.updateSetup(principal, payload)))
    .handle("updateWelcome", ({ payload }) => CurrentPrincipal.use((principal) => progress.updateWelcome(principal, payload)))
}))

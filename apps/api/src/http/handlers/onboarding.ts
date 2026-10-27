import { CurrentUser, PrimitiveApi, Unauthorized } from "@pc/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { readSession, setSessionCookieOnResponse } from "../../auth/session-cookie"
import { Onboarding } from "../../org/onboarding"
import { AppConfig } from "../../platform/config"

export const OnboardingHandlers = HttpApiBuilder.group(PrimitiveApi, "onboarding", Effect.fn(function*(handlers) {
  const onboarding = yield* Onboarding
  const config = yield* AppConfig
  return handlers.handle("createOrg", ({ payload }) =>
    Effect.gen(function*() {
      const user = yield* CurrentUser
      // SessionAuthentication already verified this cookie; it is only re-read to re-seal it into the new org.
      const session = yield* readSession
      if (session === undefined) return yield* Effect.die(new Unauthorized({ reason: "missing_credentials" }))
      const created = yield* onboarding.createOrg(user, payload.name, session)
      yield* setSessionCookieOnResponse(config, created.session)
      return created.org
    }))
}))

import { CurrentDeliveryCaller, type DeliveryCaller, DeliveryAuthentication, Unauthorized } from "@pc/domain"
import { Effect, Layer, Redacted } from "effect"
import { TokenAuthenticator, TokenPrefix } from "../access/token-auth"
import { OAuthAuthenticator } from "../oauth/authenticator"
import { isMachineToken, MachineTokenAuthenticator } from "./machine-token-auth"

/**
 * Bearer authentication for `POST /api/secrets/deliver`: a machine token (`pcm_`), a personal token (`pc_`)
 * or an AuthKit access token. This is the only middleware that resolves machine tokens.
 */
export const DeliveryAuthenticationLive = Layer.effect(
  DeliveryAuthentication,
  Effect.gen(function*() {
    const machines = yield* MachineTokenAuthenticator
    const tokens = yield* TokenAuthenticator
    const oauth = yield* OAuthAuthenticator

    const callerOf = (credential: Redacted.Redacted<string>): Effect.Effect<DeliveryCaller, Unauthorized> => {
      if (isMachineToken(credential)) return Effect.map(machines.authenticate(credential), (token) => ({ _tag: "Machine", token }))
      const member = Redacted.value(credential).startsWith(TokenPrefix) ? tokens.authenticate(credential) : oauth.authenticate(credential)
      return Effect.map(member, (principal) => ({ _tag: "Member", principal }))
    }

    return DeliveryAuthentication.of({
      bearer: Effect.fn("DeliveryAuthentication.bearer")(function*(httpEffect, { credential }) {
        if (Redacted.value(credential) === "") return yield* new Unauthorized({ reason: "missing_credentials" })
        const caller = yield* callerOf(credential)
        yield* Effect.annotateCurrentSpan({ "org.id": caller._tag === "Machine" ? caller.token.orgId : caller.principal.orgId, "delivery.caller": caller._tag })
        return yield* Effect.provideService(httpEffect, CurrentDeliveryCaller, caller)
      })
    })
  })
)

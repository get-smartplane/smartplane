import { OAuthReturnTo, OrgId, ResourceId, UserId } from "@pc/domain"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SingleUseStore, singleUseStates } from "../../platform/single-use-states"

/** One authorization in flight: who started it, for which integration, and the PKCE verifier. */
export const PendingAuthorization = Schema.Struct({
  orgId: OrgId,
  resourceId: ResourceId,
  userId: UserId,
  /** The OAuth app the flow was started for; a changed app invalidates the flow. */
  clientId: Schema.String,
  codeVerifier: Schema.NullOr(Schema.String),
  /** Absent: back to the integration's page. Optional so flows started before it existed still decode. */
  returnTo: Schema.optionalKey(OAuthReturnTo)
})
export type PendingAuthorization = typeof PendingAuthorization.Type

/** The provider must redirect back within this window. */
export const StateTtlSeconds = 600

/** Pending authorizations by `state`, in D1. A state is single-use: taking it deletes it. */
export class OAuthStates extends Context.Service<OAuthStates, {
  readonly put: (state: string, pending: PendingAuthorization) => Effect.Effect<void>
  readonly take: (state: string) => Effect.Effect<Option.Option<PendingAuthorization>>
}>()("api/integrations/OAuthStates") {
  static readonly layer = Layer.effect(
    OAuthStates,
    Effect.gen(function*() {
      const states = singleUseStates(yield* SingleUseStore, "oauth-state:v1", PendingAuthorization, StateTtlSeconds)
      return OAuthStates.of(states)
    })
  )
}

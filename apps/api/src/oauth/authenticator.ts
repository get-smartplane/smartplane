import { MachineTokenPrefix, type OrgId, type Principal, Unauthorized, type UserId } from "@pc/domain"
import { Context, Effect, Layer, Option, Redacted } from "effect"
import { Principals } from "../auth/principals"
import { UsersRepo } from "../auth/users-repo"
import { MembersRepo } from "../org/members-repo"
import { OrgsRepo } from "../org/orgs-repo"
import { AppConfig } from "../platform/config"
import { oauthSettings } from "./settings"
import { type AccessTokenClaims, AccessTokenVerifier } from "./verifier"

/**
 * Maps a verified AuthKit access token to the same member `Principal` a personal token would give: the
 * org comes from the token's `org_id` (or the user's only active membership), and the membership must be
 * active, so offboarding cuts OAuth access as soon as `deprovisionMember` has run.
 */
export class OAuthAuthenticator extends Context.Service<OAuthAuthenticator, {
  readonly authenticate: (token: Redacted.Redacted<string>) => Effect.Effect<Principal, Unauthorized>
}>()("api/oauth/OAuthAuthenticator") {
  static readonly layer = Layer.effect(
    OAuthAuthenticator,
    Effect.gen(function*() {
      const settings = oauthSettings(yield* AppConfig)
      const verifier = yield* AccessTokenVerifier
      const users = yield* UsersRepo
      const orgs = yield* OrgsRepo
      const members = yield* MembersRepo
      const principals = yield* Principals
      const noOrganization = new Unauthorized({ reason: "no_organization" })

      const orgOf = Effect.fn("OAuthAuthenticator.orgOf")(function*(claims: AccessTokenClaims, userId: UserId) {
        if (claims.org_id !== undefined) {
          const org = yield* orgs.findByWorkosId(claims.org_id)
          return yield* Option.match(org, { onNone: () => Effect.fail(noOrganization), onSome: (found) => Effect.succeed<OrgId>(found.id) })
        }
        const memberships = yield* members.activeMembershipsOf(userId)
        const only = memberships.length === 1 ? memberships[0] : undefined
        return only === undefined ? yield* noOrganization : only.orgId
      })

      const authenticate = Effect.fn("OAuthAuthenticator.authenticate")(function*(token: Redacted.Redacted<string>) {
        // Machine tokens reach only the delivery endpoint (DeliveryAuthentication), never the API or /mcp.
        if (settings === undefined || Redacted.value(token).startsWith(MachineTokenPrefix)) return yield* new Unauthorized({ reason: "invalid_credentials" })
        const claims = yield* verifier.verify(settings, token)
        const user = yield* users.findByWorkosId(claims.sub)
        if (Option.isNone(user)) return yield* new Unauthorized({ reason: "invalid_credentials" })
        if (user.value.status !== "active") return yield* new Unauthorized({ reason: "deprovisioned" })
        const orgId = yield* orgOf(claims, user.value.id)
        const member = yield* members.findByUser(orgId, user.value.id)
        if (Option.isNone(member)) return yield* noOrganization
        const principal = yield* principals.forMember(orgId, member.value, { tokenId: null, projectId: null })
        yield* Effect.annotateCurrentSpan({ "org.id": orgId, "principal.kind": principal._tag, "auth.method": "oauth" })
        return principal
      })

      return OAuthAuthenticator.of({ authenticate })
    })
  )
}

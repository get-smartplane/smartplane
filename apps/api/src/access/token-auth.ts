import { builtinRolePermissions, MachineTokenPrefix, type Principal, RoleSlug, Unauthorized } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Redacted } from "effect"
import { Principals } from "../auth/principals"
import { sha256Hex } from "../platform/encoding"
import { type Credential, TokensRepo } from "./tokens-repo"

export const TokenPrefix = "pc_"

/** Service accounts get the `member` role's dashboard permissions; resource access comes only from their own grants. */
const serviceAccountRole = RoleSlug.make("member")

/** Authenticates `Authorization: Bearer pc_...` access tokens for the API and the MCP gateway. */
export class TokenAuthenticator extends Context.Service<TokenAuthenticator, {
  readonly authenticate: (plaintext: Redacted.Redacted<string>) => Effect.Effect<Principal, Unauthorized>
}>()("api/access/TokenAuthenticator") {
  static readonly layer = Layer.effect(
    TokenAuthenticator,
    Effect.gen(function*() {
      const tokens = yield* TokensRepo
      const principals = yield* Principals
      const invalid = new Unauthorized({ reason: "invalid_credentials" })

      const principalFor = (credential: Credential): Effect.Effect<Principal, Unauthorized> => {
        const { token } = credential
        if (token.kind === "service_account") {
          return Effect.succeed({
            _tag: "ServiceAccount",
            orgId: token.orgId,
            tokenId: token.id,
            name: token.name,
            role: serviceAccountRole,
            permissions: builtinRolePermissions.member,
            teamIds: [],
            projectId: token.projectId
          })
        }
        // Offboarding: a personal token dies with its membership, even before revocation has run.
        if (
          credential.membershipId === null || credential.role === null || credential.email === null ||
          credential.membershipStatus !== "active" || credential.userStatus !== "active"
        ) return Effect.fail(new Unauthorized({ reason: "deprovisioned" }))
        return principals.forMember(token.orgId, {
          id: credential.membershipId,
          userId: token.createdBy,
          email: credential.email,
          role: credential.role,
          status: credential.membershipStatus
        }, { tokenId: token.id, projectId: token.projectId })
      }

      return TokenAuthenticator.of({
        authenticate: Effect.fn("TokenAuthenticator.authenticate")(function*(plaintext: Redacted.Redacted<string>) {
          const value = Redacted.value(plaintext)
          // Machine tokens reach only the delivery endpoint (DeliveryAuthentication), never the API or /mcp.
          if (value.startsWith(MachineTokenPrefix) || !value.startsWith(TokenPrefix)) return yield* invalid
          const found = yield* tokens.findByHash(yield* Effect.promise(() => sha256Hex(value)))
          if (Option.isNone(found)) return yield* invalid
          const { token } = found.value
          if (token.revokedAt !== null) return yield* invalid
          if (!DateTime.isGreaterThan(token.expiresAt, yield* DateTime.now)) return yield* new Unauthorized({ reason: "expired" })
          const principal = yield* principalFor(found.value)
          // Best effort; last-used feeds access reviews, not security decisions.
          yield* tokens.touch(token.id)
          yield* Effect.annotateCurrentSpan({ "org.id": token.orgId, "principal.kind": principal._tag, "token.kind": token.kind })
          return principal
        })
      })
    })
  )
}

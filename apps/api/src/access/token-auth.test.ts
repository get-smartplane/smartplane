import { assert, describe, it } from "@effect/vitest"
import { AccessTokenId } from "@pc/domain"
import { Effect, Layer, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { Principals } from "../auth/principals"
import { UsersRepo } from "../auth/users-repo"
import { MembersRepo } from "../org/members-repo"
import { OrgsRepo } from "../org/orgs-repo"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { TestDatabase } from "../testing/database"
import { now, orgId } from "../testing/fixtures"
import { seedOrg, seedToken, selectRows } from "../testing/seed"
import { TokenAuthenticator } from "./token-auth"
import { TokensRepo } from "./tokens-repo"

const TestLayer = TokenAuthenticator.layer.pipe(
  Layer.provide(Principals.layer),
  Layer.provideMerge(Layer.mergeAll(TokensRepo.layer, UsersRepo.layer, OrgsRepo.layer, MembersRepo.layer, RolesRepo.layer, TeamsRepo.layer)),
  Layer.provideMerge(TestDatabase)
)

const authenticate = (plaintext: string) => TokenAuthenticator.use((auth) => auth.authenticate(Redacted.make(plaintext)))
const reasonOf = (plaintext: string) => authenticate(plaintext).pipe(Effect.flip, Effect.map((error) => error.reason))

const setup = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
})

describe("token authentication", () => {
  it.effect("resolves a live personal token to its member, with teams, and records last use", () =>
    Effect.gen(function*() {
      yield* setup
      yield* seedToken("tok_live0001", "pc_live")
      const principal = yield* authenticate("pc_live")
      assert.strictEqual(principal._tag, "User")
      if (principal._tag !== "User") return
      assert.strictEqual(principal.tokenId, "tok_live0001")
      assert.deepStrictEqual(principal.teamIds.map(String), ["team_testteam1"])
      assert.deepStrictEqual(principal.permissions, ["resources:read"])
      const [row] = yield* selectRows("SELECT last_used_at FROM access_tokens WHERE id = ?", "tok_live0001")
      assert.isNotNull(row?.last_used_at)
    }).pipe(Effect.provide(TestLayer)))

  it.effect("rejects unknown and malformed tokens", () =>
    Effect.gen(function*() {
      yield* setup
      assert.strictEqual(yield* reasonOf("pc_unknown"), "invalid_credentials")
      assert.strictEqual(yield* reasonOf("not-a-token"), "invalid_credentials")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("rejects an expired token", () =>
    Effect.gen(function*() {
      yield* setup
      yield* seedToken("tok_expired1", "pc_expired", { expiresAt: now })
      assert.strictEqual(yield* reasonOf("pc_expired"), "expired")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("rejects a revoked token", () =>
    Effect.gen(function*() {
      yield* setup
      yield* seedToken("tok_revoked1", "pc_revoked")
      yield* TokensRepo.use((tokens) => tokens.revoke(orgId, AccessTokenId.make("tok_revoked1"), null))
      assert.strictEqual(yield* reasonOf("pc_revoked"), "invalid_credentials")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("rejects a personal token once its membership is deprovisioned, even if not yet revoked", () =>
    Effect.gen(function*() {
      yield* setup
      yield* seedToken("tok_member01", "pc_member")
      yield* selectRows("UPDATE memberships SET status = 'deprovisioned' WHERE id = ?", "mem_testmem01")
      assert.strictEqual(yield* reasonOf("pc_member"), "deprovisioned")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("rejects a personal token of a globally deprovisioned user", () =>
    Effect.gen(function*() {
      yield* setup
      yield* seedToken("tok_member02", "pc_user")
      yield* selectRows("UPDATE users SET status = 'deprovisioned'")
      assert.strictEqual(yield* reasonOf("pc_user"), "deprovisioned")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("gives service-account tokens their own principal", () =>
    Effect.gen(function*() {
      yield* setup
      yield* seedToken("tok_service01", "pc_service", { kind: "service_account", membershipId: null })
      const principal = yield* authenticate("pc_service")
      assert.strictEqual(principal._tag, "ServiceAccount")
      assert.deepStrictEqual(principal.teamIds, [])
    }).pipe(Effect.provide(TestLayer)))
})

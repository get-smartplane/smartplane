import { assert, describe, it } from "@effect/vitest"
import { AccessTokenId, type CreateAccessToken, ProjectId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { now, serviceAccountPrincipal, userPrincipal } from "../testing/fixtures"
import { resourceServices } from "../testing/resource-world"
import { seedOrg } from "../testing/seed"
import { Tokens } from "./tokens"

const orgWide: CreateAccessToken = { name: "Laptop", kind: "personal", projectId: null, ttlDays: 90 }
const failure = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => Effect.map(Effect.flip(effect), (e) => e._tag)
const services = Tokens.layer.pipe(Layer.provideMerge(resourceServices()))

describe("access tokens", () => {
  it.effect("are created from a dashboard session", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const created = yield* Tokens.use((tokens) => tokens.create(userPrincipal(), orgWide))
      assert.strictEqual(created.token.projectId, null)
    }).pipe(Effect.provide(services)))

  it.effect("cannot be minted by a bearer token, personal or service account", () =>
    Effect.gen(function*() {
      yield* seedOrg
      const viaToken = userPrincipal({ tokenId: AccessTokenId.make("tok_projtok01"), projectId: ProjectId.make("prj_testprj01") })
      const admin = userPrincipal({ tokenId: AccessTokenId.make("tok_admintok1"), permissions: ["tokens:manage"] })
      const tokens = yield* Tokens
      assert.strictEqual(yield* failure(tokens.create(viaToken, orgWide)), "Forbidden")
      assert.strictEqual(yield* failure(tokens.create(admin, { ...orgWide, kind: "service_account" })), "Forbidden")
      assert.strictEqual(yield* failure(tokens.create(serviceAccountPrincipal(), orgWide)), "Forbidden")
    }).pipe(Effect.provide(services)))

  it.effect("never widen a project-scoped caller to the whole org", () =>
    Effect.gen(function*() {
      yield* seedOrg
      const scoped = userPrincipal({ projectId: ProjectId.make("prj_testprj01") })
      assert.strictEqual(yield* failure(Tokens.use((tokens) => tokens.create(scoped, orgWide))), "Forbidden")
    }).pipe(Effect.provide(services)))
})

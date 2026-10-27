import { assert, describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Redacted } from "effect"
import { HttpServer } from "effect/http"
import { HttpApiBuilder, HttpApiTest, OpenApi } from "effect/http-api"
import { ChainVerification } from "../audit/query"
import { Unauthorized } from "../errors"
import { AccessTokenId, MembershipId, OrgId, RoleSlug, UserId } from "../ids"
import { CurrentPrincipal, type Principal } from "../principal"
import { PrimitiveApi } from "./index"
import { CurrentDeliveryCaller } from "../access/machine-token"
import { ResourceId } from "../ids"
import { Authentication, DeliveryAuthentication, SessionAuthentication } from "./security"

const orgId = OrgId.make("org_abcdefgh")
const userId = UserId.make("usr_abcdefgh")
const now = DateTime.makeUnsafe("2026-01-01T00:00:00Z")

const principal: Principal = {
  _tag: "User",
  orgId,
  userId,
  membershipId: MembershipId.make("mem_abcdefgh"),
  email: "ada@example.com",
  role: RoleSlug.make("owner"),
  permissions: ["tokens:manage", "audit:read"],
  teamIds: [],
  projectId: null,
  tokenId: null
}

/** The session scheme finds no cookie and falls through to bearer, which accepts anything. */
const AuthenticationTest = Layer.succeed(Authentication, {
  session: () => Effect.fail(new Unauthorized({ reason: "missing_credentials" })),
  bearer: (httpEffect) => Effect.provideService(httpEffect, CurrentPrincipal, principal)
})

const SessionAuthenticationTest = Layer.succeed(SessionAuthentication, {
  session: () => Effect.fail(new Unauthorized({ reason: "missing_credentials" }))
})

const DeliveryAuthenticationTest = Layer.succeed(DeliveryAuthentication, {
  bearer: (httpEffect) => Effect.provideService(httpEffect, CurrentDeliveryCaller, { _tag: "Member", principal })
})

const DeliveryTest = HttpApiBuilder.group(PrimitiveApi, "secretDelivery", (handlers) =>
  handlers.handle("deliver", () =>
    Effect.succeed({
      env: [{ name: "STRIPE_KEY", value: Redacted.make("sk_live_x"), kind: "secret" as const, version: "3", resourceId: ResourceId.make("res_abcdefgh") }],
      denied: [{ name: "MISSING", reason: "unknown" as const }],
      expiresAt: null
    }))
)

const TokensTest = HttpApiBuilder.group(PrimitiveApi, "tokens", (handlers) =>
  handlers
    .handle("list", () => Effect.succeed([]))
    .handle("create", ({ payload }) =>
      Effect.succeed({
        token: {
          id: AccessTokenId.make("tok_abcdefgh"),
          orgId,
          kind: payload.kind,
          name: payload.name,
          prefix: "pc_1234",
          createdBy: userId,
          projectId: payload.projectId,
          expiresAt: DateTime.add(now, { days: payload.ttlDays }),
          lastUsedAt: null,
          createdAt: now,
          revokedAt: null
        },
        plaintext: Redacted.make("pc_1234secret"),
        mcpUrl: "https://api.example.com/mcp"
      }))
    .handle("revoke", () => Effect.void)
)

const AuditTest = HttpApiBuilder.group(PrimitiveApi, "audit", (handlers) =>
  handlers
    .handle("list", ({ query }) => Effect.succeed({ events: [], nextCursor: query.before ?? null, prevCursor: query.after ?? null }))
    .handle("deliveries", () => Effect.succeed([]))
    .handle("verify", ({ query }) => Effect.succeed(ChainVerification.cases.Intact.make({ fromSeq: query.fromSeq ?? 1, checked: 0 })))
    .handle("export", () => Effect.succeed(""))
)

const OnboardingTest = HttpApiBuilder.group(PrimitiveApi, "onboarding", (handlers) =>
  handlers.handle("createOrg", () => Effect.die("unreachable without a session"))
)

const TestLayer = Layer.mergeAll(TokensTest, AuditTest, OnboardingTest, DeliveryTest).pipe(
  Layer.provideMerge(Layer.mergeAll(AuthenticationTest, SessionAuthenticationTest, DeliveryAuthenticationTest)),
  Layer.provideMerge(HttpServer.layerServices)
)

describe("PrimitiveApi", () => {
  it("builds an OpenAPI document with every route under /api", () => {
    const spec = OpenApi.fromApi(PrimitiveApi)
    const paths = Object.keys(spec.paths)
    expect(paths.every((path) => path.startsWith("/api/"))).toBe(true)
    expect(paths).toContain("/api/resources/{id}/rotate")
    expect(paths).toContain("/api/onboarding/orgs")
    expect(paths).toContain("/api/onboarding/progress")
    expect(paths).toContain("/api/onboarding/setup")
    expect(paths).toContain("/api/onboarding/welcome")
    expect(paths).toContain("/api/org/admin-portal-link")
    expect(paths).toContain("/api/access-reviews/{id}/items/{itemId}/decision")
    expect(paths).toContain("/api/lookup")
    expect(paths).toContain("/api/secrets/rewrap")
    expect(paths).toContain("/api/secrets/deliver")
    expect(paths).toContain("/api/machine-tokens/{id}/renew")
    expect(paths).toContain("/api/resources/{id}/delivery")
    expect(paths).toContain("/api/integrations/catalog/{pieceId}")
    expect(paths).toContain("/api/integrations/{id}/oauth/start")
    expect(Object.keys(spec.components.securitySchemes ?? {})).toEqual(["session", "bearer"])
  })

  it.effect("round-trips a created token with its one-time plaintext", () =>
    Effect.gen(function*() {
      const client = yield* HttpApiTest.groups(PrimitiveApi, ["tokens"])
      const created = yield* client.tokens.create({
        payload: { name: "Laptop", kind: "personal", projectId: null, ttlDays: 30 }
      })
      assert.strictEqual(Redacted.value(created.plaintext), "pc_1234secret")
      assert.strictEqual(created.token.name, "Laptop")
      assert.isTrue(DateTime.isGreaterThan(created.token.expiresAt, now))
    }).pipe(Effect.provide(TestLayer)))

  it.effect("rejects a token TTL over 90 days before reaching the handler", () =>
    Effect.gen(function*() {
      const client = yield* HttpApiTest.groups(PrimitiveApi, ["tokens"])
      const error = yield* client.tokens
        .create({ payload: { name: "Forever", kind: "personal", projectId: null, ttlDays: 365 } })
        .pipe(Effect.flip)
      assert.strictEqual(error._tag, "SchemaError")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("delivers values as plain strings on the wire and validates env names", () =>
    Effect.gen(function*() {
      const client = yield* HttpApiTest.groups(PrimitiveApi, ["secretDelivery"])
      const delivered = yield* client.secretDelivery.deliver({ payload: { purpose: "run", names: ["STRIPE_KEY", "MISSING"] } })
      assert.deepStrictEqual(delivered.env.map((entry) => Redacted.value(entry.value)), ["sk_live_x"])
      assert.deepStrictEqual(delivered.denied, [{ name: "MISSING", reason: "unknown" }])
      const invalid = yield* client.secretDelivery.deliver({ payload: { purpose: "run", names: ["lower-case"] } }).pipe(Effect.flip)
      assert.strictEqual(invalid._tag, "SchemaError")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("decodes typed query parameters", () =>
    Effect.gen(function*() {
      const client = yield* HttpApiTest.groups(PrimitiveApi, ["audit"])
      const page = yield* client.audit.list({ query: { before: 42, type: "grant.created" } })
      assert.strictEqual(page.nextCursor, 42)
      const newer = yield* client.audit.list({ query: { after: 7 } })
      assert.strictEqual(newer.prevCursor, 7)
      const verification = yield* client.audit.verify({ query: {} })
      assert.strictEqual(verification._tag, "Intact")
    }).pipe(Effect.provide(TestLayer)))

  it.effect("surfaces authentication failures as typed Unauthorized errors", () =>
    Effect.gen(function*() {
      const client = yield* HttpApiTest.groups(PrimitiveApi, ["onboarding"])
      const error = yield* client.onboarding.createOrg({ payload: { name: "Acme" } }).pipe(Effect.flip)
      assert.strictEqual(error._tag, "Unauthorized")
      if (error._tag === "Unauthorized") assert.strictEqual(error.reason, "missing_credentials")
    }).pipe(Effect.provide(TestLayer)))
})

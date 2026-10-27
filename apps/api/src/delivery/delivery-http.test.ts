import { assert, describe, it } from "@effect/vitest"
import { Authentication, DeliveryAuthentication, MembershipId, PrimitiveApi, SessionAuthentication, Unauthorized } from "@pc/domain"
import { Cause, Effect, Layer, Redacted } from "effect"
import { HttpClientRequest, HttpServer } from "effect/http"
import { HttpApiMiddleware, HttpApiTest } from "effect/http-api"
import { TestClock } from "effect/testing"
import { systemActor } from "../audit/actor"
import { AuthenticationLive } from "../auth/middleware"
import { WorkOS } from "../auth/workos"
import { ResourceDeliveryHandlers, SecretDeliveryHandlers } from "../http/handlers/secret-delivery"
import { authenticate as authenticateMcp } from "../mcp/route"
import { OAuthAuthenticator } from "../oauth/authenticator"
import { AccessTokenVerifier } from "../oauth/verifier"
import { Offboarding } from "../org/offboarding"
import { admin, createSecret, deliveryServices, grant } from "../testing/delivery-world"
import { now, orgId } from "../testing/fixtures"
import { seedOrg, seedToken } from "../testing/seed"
import { DeliveryAuthenticationLive } from "./middleware"
import { MachineTokens } from "./machine-tokens"

const unused = () => Effect.die("not used")
const workos = Layer.succeed(WorkOS, WorkOS.of({
  authorizationUrl: () => "", exchangeCode: unused, authenticate: unused, switchOrganization: unused, logoutUrl: unused,
  createOrganization: unused, createMembership: unused, sendInvitation: unused, verifyWebhook: () => Effect.succeed(false)
}))
const verifier = Layer.succeed(AccessTokenVerifier, AccessTokenVerifier.of({ verify: () => Effect.fail(new Unauthorized({ reason: "invalid_credentials" })) }))
const noSessions = Layer.succeed(SessionAuthentication, { session: () => Effect.fail(new Unauthorized({ reason: "missing_credentials" })) })

/** The real API pipeline for the delivery groups, with the real authentication middleware of every group. */
const world = Layer.mergeAll(SecretDeliveryHandlers, ResourceDeliveryHandlers).pipe(
  Layer.provideMerge(Layer.mergeAll(AuthenticationLive, DeliveryAuthenticationLive, noSessions)),
  Layer.provideMerge(OAuthAuthenticator.layer.pipe(Layer.provide(verifier))),
  Layer.provideMerge(Layer.merge(deliveryServices([]), workos)),
  Layer.provideMerge(HttpServer.layerServices)
)

/** Sends `token` as the bearer credential on every scheme, as a client would. */
const bearer = (token: string) => {
  const attach = HttpApiMiddleware.layerClient(Authentication, ({ next, request }) => next(HttpClientRequest.bearerToken(request, token)))
  const attachDelivery = HttpApiMiddleware.layerClient(DeliveryAuthentication, ({ next, request }) => next(HttpClientRequest.bearerToken(request, token)))
  return Layer.merge(attach, attachDelivery)
}

const client = HttpApiTest.groups(PrimitiveApi, ["secretDelivery", "resourceDelivery"])
const tagOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => Effect.map(Effect.flip(effect), (e) => e._tag)

const setup = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  const stripe = yield* createSecret("stripe-key", "sk_live_http", { deliverable: true })
  yield* grant("grt_stripe0001", stripe)
  const created = yield* MachineTokens.use((tokens) => tokens.create(admin, { name: "billing-api", allow: [stripe.id] }))
  return { stripe, machine: Redacted.value(created.plaintext) }
})

describe("POST /api/secrets/deliver over HTTP", () => {
  it.effect("delivers to a machine token with no-store headers, and refuses it everywhere else", () =>
    Effect.gen(function*() {
      const { stripe, machine } = yield* setup
      const api = yield* client.pipe(Effect.provide(bearer(machine)))
      const response = yield* api.secretDelivery.deliver({ payload: { purpose: "boot" }, responseMode: "response-only" }).pipe(Effect.provide(bearer(machine)))
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers["cache-control"], "no-store")
      assert.strictEqual(response.headers.pragma, "no-cache")
      const body = yield* response.json
      assert.deepStrictEqual(body, {
        env: [{ name: "STRIPE_KEY", value: "sk_live_http", kind: "secret", version: "1", resourceId: stripe.id }],
        denied: [],
        expiresAt: "2027-01-13T12:00:00.000Z"
      })

      // Admin APIs (here: the resource delivery settings, the tokens and grants groups share the same middleware) and /mcp.
      const settings = yield* tagOf(api.resourceDelivery.update({ params: { id: stripe.id }, payload: { delivery: "gateway_only" } }).pipe(Effect.provide(bearer(machine))))
      assert.strictEqual(settings, "Unauthorized")
      const full = yield* HttpApiTest.groups(PrimitiveApi, ["secretDelivery"]).pipe(Effect.provide(bearer(machine)))
      const asMachine = Effect.provide(bearer(machine))
      const refused = [
        yield* tagOf(asMachine(full.tokens.list({ query: {} }))),
        yield* tagOf(asMachine(full.grants.list({ query: {} }))),
        yield* tagOf(asMachine(full.audit.list({ query: {} }))),
        yield* tagOf(asMachine(full.machineTokens.list()))
      ]
      assert.deepStrictEqual(refused, ["Unauthorized", "Unauthorized", "Unauthorized", "Unauthorized"])
      assert.strictEqual(yield* tagOf(authenticateMcp(Redacted.make(machine))), "Unauthorized")
    }).pipe(Effect.provide(world)))

  it.effect("answers 429 with Retry-After once a machine token exceeds 30 deliveries a minute", () =>
    Effect.gen(function*() {
      const { machine } = yield* setup
      const api = yield* client.pipe(Effect.provide(bearer(machine)))
      const call = api.secretDelivery.deliver({ payload: { purpose: "boot" }, responseMode: "response-only" }).pipe(Effect.provide(bearer(machine)))
      for (let i = 0; i < 30; i++) assert.strictEqual((yield* call).status, 200)
      const limited = yield* call
      assert.strictEqual(limited.status, 429)
      assert.strictEqual(limited.headers["retry-after"], "60")
      assert.strictEqual(limited.headers["cache-control"], "no-store")
    }).pipe(Effect.provide(world)))

  it.effect("accepts a member's personal token until the member is offboarded", () =>
    Effect.gen(function*() {
      yield* setup
      yield* seedToken("tok_personal01", "pc_personal_secret_token")
      const api = yield* client.pipe(Effect.provide(bearer("pc_personal_secret_token")))
      const deliverAsMember = api.secretDelivery.deliver({ payload: { purpose: "run", names: ["STRIPE_KEY"] } }).pipe(Effect.provide(bearer("pc_personal_secret_token")))
      assert.deepStrictEqual((yield* deliverAsMember).env.map((entry) => entry.name), ["STRIPE_KEY"])
      // Control for the machine-token refusals above: a personal token passes authentication on an admin API
      // and reaches its (here unwired) handler, so those refusals did come from the auth layer.
      const full = yield* HttpApiTest.groups(PrimitiveApi, ["secretDelivery"]).pipe(Effect.provide(bearer("pc_personal_secret_token")))
      const control = yield* full.tokens.list({ query: {} }).pipe(
        Effect.provide(bearer("pc_personal_secret_token")),
        Effect.as("handled"),
        Effect.catchCause((cause) => Effect.succeed(Cause.hasDies(cause) ? "reached the handler" : "refused"))
      )
      assert.strictEqual(control, "reached the handler")
      yield* Offboarding.use((offboarding) => offboarding.deprovisionMember(orgId, MembershipId.make("mem_testmem01"), systemActor("scim"), "scim"))
      assert.strictEqual(yield* tagOf(deliverAsMember), "Unauthorized")
      const missing = yield* tagOf(api.secretDelivery.deliver({ payload: { purpose: "run" } }).pipe(Effect.provide(bearer(""))))
      assert.strictEqual(missing, "Unauthorized")
    }).pipe(Effect.provide(world)))
})

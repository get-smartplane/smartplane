import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, MachineTokenPrefix, MembershipId, type MachineToken } from "@pc/domain"
import { DateTime, Effect, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { systemActor } from "../audit/actor"
import { Offboarding } from "../org/offboarding"
import { sha256Hex } from "../platform/encoding"
import { Resources } from "../resources/resources"
import { admin, createSecret, createVariable, deliver, deliveryServices, envOf, member } from "../testing/delivery-world"
import { now, userPrincipal } from "../testing/fixtures"
import { seedOrg, selectRows } from "../testing/seed"
import { DeliverySettings } from "./delivery-settings"
import { MachineTokenAuthenticator } from "./machine-token-auth"
import { MachineTokens } from "./machine-tokens"

const machine = (token: MachineToken) => ({ _tag: "Machine" as const, token })
const authenticate = (plaintext: Redacted.Redacted<string>) => MachineTokenAuthenticator.use((auth) => auth.authenticate(plaintext))
const failure = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => Effect.map(Effect.flip(effect), (e) => e._tag)

describe("machine tokens", () => {
  it.effect("are shown once, stored as a hash, and receive exactly their deliverable allow-list", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const stripe = yield* createSecret("stripe-key", "sk_live_machine", { deliverable: true })
      const sentry = yield* createSecret("sentry-dsn", "dsn_machine", { deliverable: true })
      const notListed = yield* createSecret("other-key", "other_machine", { deliverable: true })
      const gatewayOnly = yield* createSecret("github-token", "ghp_machine")
      const region = yield* createVariable("region", "eu-west-1")
      const tokens = yield* MachineTokens

      // Creating needs both tokens:manage and resources:manage; a gateway-only secret cannot be listed.
      const tokensOnly = userPrincipal({ permissions: ["tokens:manage"] })
      assert.strictEqual(yield* failure(tokens.create(tokensOnly, { name: "billing-api", allow: [stripe.id] })), "Forbidden")
      assert.strictEqual(yield* failure(tokens.create(admin, { name: "billing-api", allow: [gatewayOnly.id] })), "InvalidInput")

      const created = yield* tokens.create(admin, { name: "billing-api (Railway)", allow: [stripe.id, sentry.id, region.id], ttlDays: 30 })
      const plaintext = Redacted.value(created.plaintext)
      assert.isTrue(plaintext.startsWith(MachineTokenPrefix))
      assert.strictEqual(created.deliverUrl, "https://api.example.com/api/secrets/deliver")
      const [row] = yield* selectRows("SELECT * FROM machine_tokens WHERE id = ?", created.token.id)
      assert.strictEqual(row?.tokenHash, yield* Effect.promise(() => sha256Hex(plaintext)))
      assert.notInclude(JSON.stringify(row), plaintext)
      assert.notInclude(JSON.stringify(events), plaintext)
      assert.deepInclude(events.find((event) => event.type === "machine_token.created")?.data, { name: "billing-api (Railway)", allow: [stripe.id, sentry.id, region.id] })

      const token = yield* authenticate(created.plaintext)
      const delivered = yield* deliver(machine(token), { purpose: "boot", names: ["STRIPE_KEY", "SENTRY_DSN", "REGION", "OTHER_KEY", "GITHUB_TOKEN"] })
      assert.deepStrictEqual(envOf(delivered.env), { STRIPE_KEY: "sk_live_machine", SENTRY_DSN: "dsn_machine", REGION: "eu-west-1" })
      assert.deepStrictEqual(delivered.denied, [{ name: "OTHER_KEY", reason: "unknown" }, { name: "GITHUB_TOKEN", reason: "unknown" }])
      assert.deepStrictEqual(delivered.expiresAt, created.token.expiresAt)
      assert.isDefined(notListed)
      const audited = events.filter((event) => event.type === "secret.delivered")
      assert.deepStrictEqual(audited.map((event) => event.actor), audited.map(() => systemActor(`machine_token:${token.id}`)))
      assert.isTrue(audited.every((event) => event.data.machineTokenId === token.id && event.data.machineName === token.name))

      // Allow-list entries that become gateway-only or are deleted drop out.
      yield* DeliverySettings.use((settings) => settings.update(admin, sentry.id, { delivery: "gateway_only" }))
      yield* Resources.use((resources) => resources.remove(admin, region.id))
      const later = yield* deliver(machine(token), { purpose: "boot", names: ["STRIPE_KEY", "SENTRY_DSN", "REGION"] })
      assert.deepStrictEqual(envOf(later.env), { STRIPE_KEY: "sk_live_machine" })
      assert.deepStrictEqual(later.denied, [{ name: "SENTRY_DSN", reason: "not_deliverable" }, { name: "REGION", reason: "unknown" }])
    }).pipe(Effect.provide(deliveryServices(events)))
  })

  it.effect("expire, renew with an audit trail, revoke, and outlive their creator's offboarding", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const stripe = yield* createSecret("stripe-key", "sk_live_x", { deliverable: true })
      const tokens = yield* MachineTokens
      const created = yield* tokens.create(admin, { name: "worker (Fly)", allow: [stripe.id], ttlDays: 1 })
      assert.deepStrictEqual(created.token.expiresAt, DateTime.add(now, { days: 1 }))
      assert.strictEqual(yield* failure(authenticate(Redacted.make("pcm_not-a-token"))), "Unauthorized")

      // The creator (ada, mem_testmem01) is offboarded: personal tokens die, the org's machine token does not.
      yield* Offboarding.use((offboarding) => offboarding.deprovisionMember(admin.orgId, MembershipId.make("mem_testmem01"), systemActor("scim"), "scim"))
      assert.strictEqual((yield* authenticate(created.plaintext)).id, created.token.id)

      yield* TestClock.adjust("2 days")
      const expired = yield* Effect.flip(authenticate(created.plaintext))
      assert.isTrue(expired._tag === "Unauthorized" && expired.reason === "expired")
      assert.strictEqual(yield* failure(tokens.renew(member, created.token.id, {})), "Forbidden")
      const renewed = yield* tokens.renew(admin, created.token.id, { ttlDays: 90 })
      assert.deepStrictEqual(renewed.expiresAt, DateTime.add(DateTime.add(now, { days: 2 }), { days: 90 }))
      assert.strictEqual((yield* authenticate(created.plaintext)).id, created.token.id)
      assert.isTrue(events.some((event) => event.type === "machine_token.renewed" && typeof event.data.previousExpiresAt === "string"))

      assert.strictEqual(yield* failure(tokens.revoke(member, created.token.id)), "Forbidden")
      yield* tokens.revoke(userPrincipal({ permissions: ["reviews:manage"] }), created.token.id)
      assert.strictEqual(yield* failure(authenticate(created.plaintext)), "Unauthorized")
      assert.strictEqual(yield* failure(tokens.renew(admin, created.token.id, {})), "NotFound", "a revoked token cannot be renewed back to life")
      assert.isTrue(events.some((event) => event.type === "machine_token.revoked"))
      const listed = yield* tokens.list(admin)
      assert.isNotNull(listed[0]?.revokedAt)
      assert.isNotNull(listed[0]?.lastUsedAt)
    }).pipe(Effect.provide(deliveryServices(events)))
  })
})

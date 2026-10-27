import { assert, describe, it } from "@effect/vitest"
import type { AuditEvent } from "@pc/domain"
import { Effect, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { Resources } from "../resources/resources"
import { admin, createSecret, createVariable, deliveryServices, grant, member } from "../testing/delivery-world"
import { now } from "../testing/fixtures"
import { seedOrg } from "../testing/seed"
import { DeliverySettings } from "./delivery-settings"

const failure = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => Effect.map(Effect.flip(effect), (e) => e._tag)
const update = (...args: Parameters<DeliverySettings["Service"]["update"]>) => DeliverySettings.use((settings) => settings.update(...args))

describe("delivery settings", () => {
  it.effect("changing delivery needs resources:manage or an admin grant, and is audited before and after", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const secret = yield* createSecret("stripe-key", "sk_live_x")
      assert.deepStrictEqual(secret.config, { kind: "secret" }, "secrets start gateway-only")

      yield* grant("grt_use0000001", secret, "use")
      assert.strictEqual(yield* failure(update(member, secret.id, { delivery: "deliverable" })), "Forbidden")
      yield* grant("grt_admin00001", secret, "admin")
      const changed = yield* update(member, secret.id, { delivery: "deliverable", envName: "STRIPE_SECRET_KEY" })
      assert.deepStrictEqual(changed.config, { kind: "secret", delivery: "deliverable", envName: "STRIPE_SECRET_KEY" })

      const audited = events.filter((event) => event.type === "secret.delivery_changed")
      assert.lengthOf(audited, 1)
      assert.deepStrictEqual(audited[0]?.data, {
        kind: "secret",
        before: { delivery: "gateway_only", envName: "STRIPE_KEY", envNameSet: false },
        after: { delivery: "deliverable", envName: "STRIPE_SECRET_KEY", envNameSet: true }
      })

      const reset = yield* update(admin, secret.id, { envName: null, delivery: "gateway_only" })
      assert.deepStrictEqual(reset.config, { kind: "secret", delivery: "gateway_only" })
      assert.deepInclude(events.filter((event) => event.type === "secret.delivery_changed")[1]?.data, { after: { delivery: "gateway_only", envName: "STRIPE_KEY", envNameSet: false } })
    }).pipe(Effect.provide(deliveryServices(events)))
  })

  it.effect("env names are unique per org and project among deliverable secrets and variables", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const live = yield* createSecret("stripe-key", "sk_live_x", { deliverable: true })
      const other = yield* createSecret("stripe-key-2", "sk_live_y", { deliverable: true })
      assert.strictEqual(yield* failure(update(admin, other.id, { envName: "STRIPE_KEY" })), "Conflict")
      // A gateway-only secret takes no env name slot, so it may share one until it is made deliverable.
      const hidden = yield* createSecret("stripe-key-3", "sk_live_z", { envName: "STRIPE_KEY" })
      assert.strictEqual(yield* failure(update(admin, hidden.id, { delivery: "deliverable" })), "Conflict")
      // Variables compete for the same names, including the derived ones.
      const created = yield* Effect.flip(Resources.use((resources) =>
        resources.create(admin, { name: "STRIPE KEY", description: "", projectId: null, config: { kind: "variable", value: "x" } })))
      assert.strictEqual(created._tag, "Conflict")
      // Freeing the name lets the other take it.
      yield* update(admin, live.id, { delivery: "gateway_only" })
      const moved = yield* update(admin, other.id, { envName: "STRIPE_KEY" })
      assert.deepInclude(moved.config, { envName: "STRIPE_KEY" })
    }).pipe(Effect.provide(deliveryServices([]))))

  it.effect("a variable keeps its env name when its value is edited, and has no gateway-only mode", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const region = yield* createVariable("region", "eu-west-1")
      yield* update(admin, region.id, { envName: "AWS_REGION" })
      const edited = yield* Resources.use((resources) => resources.update(admin, region.id, { config: { kind: "variable", value: "us-east-1" } }))
      assert.deepStrictEqual(edited.config, { kind: "variable", value: "us-east-1", envName: "AWS_REGION" })
      assert.strictEqual(yield* failure(update(admin, region.id, { delivery: "gateway_only" })), "InvalidInput")
    }).pipe(Effect.provide(deliveryServices([]))))
  it.effect("a write grant lets its holder rotate the secret; use does not", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      const secret = yield* createSecret("stripe-key", "sk_live_v1", { deliverable: true })
      const rotate = Resources.use((resources) => resources.rotateSecret(member, secret.id, { value: Redacted.make("sk_live_v2") }))
      yield* grant("grt_use0000001", secret, "use")
      assert.strictEqual(yield* failure(rotate), "Forbidden")
      yield* grant("grt_write00001", secret, "write")
      assert.strictEqual((yield* rotate).version, 2)
    }).pipe(Effect.provide(deliveryServices([]))))
})

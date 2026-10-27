import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, ProjectId, RoleSlug } from "@pc/domain"
import { DateTime, Effect, Logger, Tracer } from "effect"
import { TestClock } from "effect/testing"
import { asMember, createSecret, createVariable, deliver, deliveryServices, envOf, grant } from "../testing/delivery-world"
import { now, orgId, serviceAccountPrincipal, userId, userPrincipal } from "../testing/fixtures"
import { insertRow, seedOrg } from "../testing/seed"

const projectA = ProjectId.make("prj_projecta01")
const projectB = ProjectId.make("prj_projectb01")

const seed = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  for (const id of [projectA, projectB]) yield* insertRow("projects", { id, orgId, name: id, slug: id.replace("_", "-"), createdAt: DateTime.formatIso(now) })
})

const failure = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => Effect.map(Effect.flip(effect), (e) => e._tag)

describe("secret delivery to members", () => {
  it.effect("returns only deliverable secrets and variables the member holds a live use grant on", () =>
    Effect.gen(function*() {
      yield* seed
      const stripe = yield* createSecret("stripe-key", "sk_live_stripe", { deliverable: true })
      const gatewayOnly = yield* createSecret("github-token", "ghp_gateway_only")
      const readOnly = yield* createSecret("sentry-dsn", "dsn_read_only", { deliverable: true })
      const ungranted = yield* createSecret("aws-secret", "aws_ungranted", { deliverable: true })
      const expired = yield* createSecret("old-key", "old_expired", { deliverable: true })
      const region = yield* createVariable("region", "eu-west-1")
      yield* grant("grt_stripe0001", stripe)
      yield* grant("grt_gateway001", gatewayOnly, "admin")
      yield* grant("grt_readonly01", readOnly, "read")
      yield* grant("grt_expired001", expired, "use", { expiresAt: DateTime.subtract(now, { minutes: 1 }) })
      yield* grant("grt_region0001", region)
      assert.isDefined(ungranted)

      const everything = yield* deliver(asMember(), { purpose: "run" })
      assert.deepStrictEqual(envOf(everything.env), { STRIPE_KEY: "sk_live_stripe", REGION: "eu-west-1" })
      assert.deepStrictEqual(everything.denied, [], "nothing requested, so nothing is reported as denied")
      assert.isNull(everything.expiresAt)
      const stripeValue = everything.env.find((entry) => entry.name === "STRIPE_KEY")
      assert.deepInclude(stripeValue, { kind: "secret", version: "1", resourceId: stripe.id })

      const requested = yield* deliver(asMember(), { purpose: "run", names: ["STRIPE_KEY", "GITHUB_TOKEN", "SENTRY_DSN", "AWS_SECRET", "OLD_KEY", "NOPE"] })
      assert.deepStrictEqual(envOf(requested.env), { STRIPE_KEY: "sk_live_stripe" })
      assert.deepStrictEqual(requested.denied, [
        { name: "GITHUB_TOKEN", reason: "not_deliverable" },
        { name: "SENTRY_DSN", reason: "no_grant" },
        // No grant of any kind: the member cannot know it exists, so it reads exactly like a missing name.
        { name: "AWS_SECRET", reason: "unknown" },
        { name: "OLD_KEY", reason: "unknown" },
        { name: "NOPE", reason: "unknown" }
      ])
      // A manager may know every secret exists, so a missing grant is named as such.
      const manager = userPrincipal({ permissions: ["resources:read", "resources:manage"] })
      assert.deepStrictEqual((yield* deliver(asMember(manager), { purpose: "run", names: ["AWS_SECRET"] })).denied, [{ name: "AWS_SECRET", reason: "no_grant" }])
    }).pipe(Effect.provide(deliveryServices([]))))

  it.effect("scopes by project: a project resource overrides the org-wide one, and tokens cannot escape their project", () =>
    Effect.gen(function*() {
      yield* seed
      const shared = yield* createSecret("database-url", "postgres://shared", { deliverable: true })
      const own = yield* createSecret("database-url-a", "postgres://project-a", { deliverable: true, projectId: projectA, envName: "DATABASE_URL" })
      const other = yield* createSecret("database-url-b", "postgres://project-b", { deliverable: true, projectId: projectB, envName: "DATABASE_URL" })
      for (const [id, resource] of [["grt_shared001", shared], ["grt_own000001", own], ["grt_other0001", other]] as const) yield* grant(id, resource)

      assert.deepStrictEqual(envOf((yield* deliver(asMember(), { purpose: "run" })).env), { DATABASE_URL: "postgres://shared" })
      assert.deepStrictEqual(envOf((yield* deliver(asMember(), { purpose: "run", projectId: projectA })).env), { DATABASE_URL: "postgres://project-a" })
      const scopedToken = userPrincipal({ projectId: projectB })
      assert.deepStrictEqual(envOf((yield* deliver(asMember(scopedToken), { purpose: "boot" })).env), { DATABASE_URL: "postgres://project-b" })
      assert.strictEqual(yield* failure(deliver(asMember(scopedToken), { purpose: "boot", projectId: projectA })), "Forbidden")
    }).pipe(Effect.provide(deliveryServices([]))))

  it.effect("refuses service-account tokens: agents never receive secret values", () =>
    Effect.gen(function*() {
      yield* seed
      assert.strictEqual(yield* failure(deliver(asMember(serviceAccountPrincipal()), { purpose: "run" })), "Forbidden")
    }).pipe(Effect.provide(deliveryServices([]))))

  it.effect("records one secret.delivered per value, and no value reaches audit data, spans or logs", () => {
    const events: Array<AuditEvent> = []
    const spans: Array<Tracer.NativeSpan> = []
    const logs: Array<string> = []
    const tracer = Tracer.make({ span: (options) => { const span = new Tracer.NativeSpan(options); spans.push(span); return span } })
    const logger = Logger.make(({ message }) => void logs.push(JSON.stringify(message)))
    return Effect.gen(function*() {
      yield* seed
      const stripe = yield* createSecret("stripe-key", "sk_live_PLAINTEXT_1", { deliverable: true })
      const webhook = yield* createSecret("stripe-webhook", "whsec_PLAINTEXT_2", { deliverable: true })
      const hidden = yield* createSecret("root-password", "root_PLAINTEXT_3")
      const config = yield* createVariable("feature-flags", "flags_PLAINTEXT_4")
      for (const [id, resource] of [["grt_stripe0001", stripe], ["grt_webhook001", webhook], ["grt_hidden0001", hidden], ["grt_config0001", config]] as const) {
        yield* grant(id, resource)
      }
      const before = events.length
      const delivered = yield* deliver(asMember(), { purpose: "boot", names: ["STRIPE_KEY", "STRIPE_WEBHOOK", "ROOT_PASSWORD", "FEATURE_FLAGS"] })
      assert.strictEqual(delivered.env.length, 3)
      const deliveredEvents = events.slice(before).filter((event) => event.type === "secret.delivered")
      assert.deepStrictEqual(deliveredEvents.map((event) => event.target?.id).sort(), [stripe.id, webhook.id, config.id].sort())
      assert.deepInclude(deliveredEvents.find((event) => event.target?.id === stripe.id)?.data, {
        purpose: "boot", name: "STRIPE_KEY", kind: "secret", tokenKind: "user", projectId: null, version: 1
      })
      assert.isTrue(deliveredEvents.every((event) => event.actor.type === "user" && event.actor.id === userId))
      assert.isFalse(events.slice(before).some((event) => event.type === "secret.accessed"), "delivery is its own event, not a gateway read")

      const recorded = JSON.stringify([events, spans.map((span) => [span.name, Object.fromEntries(span.attributes)]), logs])
      for (const value of ["sk_live_PLAINTEXT_1", "whsec_PLAINTEXT_2", "root_PLAINTEXT_3", "flags_PLAINTEXT_4"]) assert.notInclude(recorded, value)
      assert.isTrue(spans.some((span) => span.name === "SecretDelivery.deliver"))
      assert.isTrue(spans.some((span) => span.name === "Secrets.deliver"))
    }).pipe(
      Effect.provide(deliveryServices(events)),
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.provide(Logger.layer([logger]))
    )
  })

  it.effect("rate limits each token, deterministically per minute window", () =>
    Effect.gen(function*() {
      yield* seed
      const tokenUser = userPrincipal({ role: RoleSlug.make("member") })
      for (let i = 0; i < 60; i++) yield* deliver(asMember(tokenUser), { purpose: "run" })
      const limited = yield* Effect.flip(deliver(asMember(tokenUser), { purpose: "run" }))
      assert.strictEqual(limited._tag, "RateLimited")
      assert.isTrue(limited._tag === "RateLimited" && limited.retryAfterSeconds > 0 && limited.retryAfterSeconds <= 60)
      yield* TestClock.adjust("1 minute")
      yield* deliver(asMember(tokenUser), { purpose: "run" })
    }).pipe(Effect.provide(deliveryServices([]))))
})

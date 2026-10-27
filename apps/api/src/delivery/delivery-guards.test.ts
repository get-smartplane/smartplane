import { assert, describe, it } from "@effect/vitest"
import type { AuditEvent } from "@pc/domain"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { activeGuard, admin, asMember, type ClassifierAnswers, classifierAnswers, createSecret, deliver, deliveryServices, envOf, grant } from "../testing/delivery-world"
import { now } from "../testing/fixtures"
import { seedOrg } from "../testing/seed"
import { MachineTokens } from "./machine-tokens"

const setup = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  const live = yield* createSecret("stripe-live-key", "sk_live_guarded", { deliverable: true })
  const test = yield* createSecret("stripe-test-key", "sk_test_free", { deliverable: true })
  yield* grant("grt_live000001", live)
  yield* grant("grt_test000001", test)
  return { live, test }
})

const both = { purpose: "run" as const, names: ["STRIPE_LIVE_KEY", "STRIPE_TEST_KEY"] }

describe("delivery guards", () => {
  it.effect("an enforcing guard on one secret denies just that secret, as policy, with the delivery context", () => {
    const events: Array<AuditEvent> = []
    const answers: ClassifierAnswers = classifierAnswers()
    return Effect.gen(function*() {
      const { live } = yield* setup
      yield* activeGuard("grd_livekey001", "enforce", [live.id])
      answers.current = new Map([["grd_livekey001", 0.97]])
      const result = yield* deliver(asMember(), both)
      assert.deepStrictEqual(envOf(result.env), { STRIPE_TEST_KEY: "sk_test_free" })
      assert.deepStrictEqual(result.denied, [{ name: "STRIPE_LIVE_KEY", reason: "policy" }])
      assert.lengthOf(answers.asked, 1, "the guard is scoped to one secret, so only it is classified")
      assert.deepInclude(answers.asked[0], { tool: "secret.deliver", arguments: { name: "STRIPE_LIVE_KEY", purpose: "run", tokenKind: "user" } })
      const denial = events.find((event) => event.type === "policy.denied")
      assert.deepInclude(denial?.data, { action: "secret.deliver", name: "STRIPE_LIVE_KEY" })
      assert.isFalse(events.some((event) => event.type === "secret.delivered" && event.target?.id === live.id))
    }).pipe(Effect.provide(deliveryServices(events, answers)))
  })

  it.effect("fails closed: an org-wide enforcing guard denies everything when the classifier is down", () => {
    const answers: ClassifierAnswers = classifierAnswers()
    return Effect.gen(function*() {
      yield* setup
      yield* activeGuard("grd_orgwide001", "enforce")
      answers.current = "down"
      const result = yield* deliver(asMember(), both)
      assert.deepStrictEqual(result.env, [])
      assert.deepStrictEqual(result.denied, [{ name: "STRIPE_LIVE_KEY", reason: "policy" }, { name: "STRIPE_TEST_KEY", reason: "policy" }])
      // Unrequested denials stay silent: a request for everything just gets less.
      assert.deepStrictEqual(yield* deliver(asMember(), { purpose: "run" }), { env: [], denied: [], expiresAt: null })
    }).pipe(Effect.provide(deliveryServices([], answers)))
  })

  it.effect("monitor guards only flag; approval guards deny, since nobody can approve a boot", () => {
    const events: Array<AuditEvent> = []
    const answers: ClassifierAnswers = classifierAnswers()
    return Effect.gen(function*() {
      const { live, test } = yield* setup
      yield* activeGuard("grd_monitor001", "monitor", [test.id])
      yield* activeGuard("grd_approval01", "require_approval", [live.id])
      answers.current = new Map([["grd_monitor001", 0.9], ["grd_approval01", 0.9]])
      const result = yield* deliver(asMember(), both)
      assert.deepStrictEqual(envOf(result.env), { STRIPE_TEST_KEY: "sk_test_free" })
      assert.deepStrictEqual(result.denied, [{ name: "STRIPE_LIVE_KEY", reason: "policy" }])
      assert.isTrue(events.some((event) => event.type === "policy.flagged" && event.target?.id === test.id))
      assert.isFalse(events.some((event) => event.type === "policy.pending_approval"))
    }).pipe(Effect.provide(deliveryServices(events, answers)))
  })

  it.effect("machine tokens are classified as machines and limited to 30 deliveries a minute", () => {
    const answers: ClassifierAnswers = classifierAnswers()
    return Effect.gen(function*() {
      const { live } = yield* setup
      yield* activeGuard("grd_livekey001", "monitor", [live.id])
      const created = yield* MachineTokens.use((tokens) => tokens.create(admin, { name: "billing-api", allow: [live.id] }))
      const caller = { _tag: "Machine" as const, token: created.token }
      yield* deliver(caller, { purpose: "boot" })
      assert.deepInclude(answers.asked[0], { arguments: { name: "STRIPE_LIVE_KEY", purpose: "boot", tokenKind: "machine", machineName: "billing-api" } })
      for (let i = 1; i < 30; i++) yield* deliver(caller, { purpose: "boot" })
      const limited = yield* Effect.flip(deliver(caller, { purpose: "boot" }))
      assert.strictEqual(limited._tag, "RateLimited")
      // Another caller has its own budget.
      yield* deliver(asMember(), { purpose: "run" })
    }).pipe(Effect.provide(deliveryServices([], answers)))
  })
})

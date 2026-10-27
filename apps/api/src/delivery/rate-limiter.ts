import { Clock, Context, Effect, Layer } from "effect"
import { WorkerBindings } from "../platform/bindings"
import { hitWindow, type RateDecision, type RateRule, type WindowState } from "./fixed-window"

/** Delivery requests per token per minute. Machines boot rarely; people re-run commands more often. */
export const DeliveryRateRules = {
  member: { limit: 60, windowMs: 60_000 },
  machine: { limit: 30, windowMs: 60_000 }
} satisfies Record<string, RateRule>

/** Counts hits per key. Production: one `RateLimiter` Durable Object per key; tests: an in-memory map on the Effect clock. */
export class RateLimiter extends Context.Service<RateLimiter, {
  readonly hit: (key: string, rule: RateRule) => Effect.Effect<RateDecision>
}>()("api/delivery/RateLimiter") {
  static readonly layer = Layer.effect(
    RateLimiter,
    Effect.gen(function*() {
      const namespace = (yield* WorkerBindings).RATE_LIMITER
      return RateLimiter.of({
        hit: Effect.fn("RateLimiter.hit")(function*(key: string, rule: RateRule) {
          const retryAfterSeconds = yield* Effect.promise(() => namespace.get(namespace.idFromName(key)).hit(rule.limit, rule.windowMs))
          const decision: RateDecision = retryAfterSeconds > 0 ? { _tag: "Limited", retryAfterSeconds } : { _tag: "Allowed" }
          return decision
        })
      })
    })
  )

  /** Deterministic under `TestClock`. */
  static readonly memory = Layer.sync(RateLimiter, () => {
    const windows = new Map<string, WindowState>()
    return RateLimiter.of({
      hit: (key, rule) =>
        Effect.map(Clock.currentTimeMillis, (now) => {
          const { state, decision } = hitWindow(windows.get(key), rule, now)
          windows.set(key, state)
          return decision
        })
    })
  })
}

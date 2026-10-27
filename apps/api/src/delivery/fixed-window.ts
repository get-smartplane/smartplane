/** A fixed-window counter: at most `limit` hits per `windowMs`. Pure, so the Durable Object and tests share it. */
export interface WindowState {
  readonly windowStart: number
  readonly count: number
}

export interface RateRule {
  readonly limit: number
  readonly windowMs: number
}

export type RateDecision =
  | { readonly _tag: "Allowed" }
  | { readonly _tag: "Limited"; readonly retryAfterSeconds: number }

export const hitWindow = (state: WindowState | undefined, rule: RateRule, nowMs: number): { readonly state: WindowState; readonly decision: RateDecision } => {
  const windowStart = nowMs - (nowMs % rule.windowMs)
  const count = state !== undefined && state.windowStart === windowStart ? state.count : 0
  if (count >= rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + rule.windowMs - nowMs) / 1000))
    return { state: { windowStart, count }, decision: { _tag: "Limited", retryAfterSeconds } }
  }
  return { state: { windowStart, count: count + 1 }, decision: { _tag: "Allowed" } }
}

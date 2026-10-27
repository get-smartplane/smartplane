import type { AuditPage } from "@pc/domain"
import { DateTime, Effect } from "effect"
import { apiQuery } from "@/lib/api/atoms"
import { decisionMeta, type DecisionKind } from "./decision-kind"

/** One page per outcome is enough for a week at a glance; a full page means the count is a lower bound. */
export const decisionsPageLimit = 500
export const decisionDays = 7

export interface DecisionWindow {
  /** Local midnight, six days ago: the chart's first day. */
  readonly from: Date
  readonly pages: { readonly [K in DecisionKind]: AuditPage }
}

const windowStart = Effect.sync(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (decisionDays - 1))
  return start
})

/** Gateway decisions of the last seven days, read from the audit log with the existing type filter. */
export const decisionsAtom = apiQuery(["audit"], (api) =>
  Effect.gen(function*() {
    const from = yield* windowStart
    const list = (kind: DecisionKind) =>
      api.audit.list({ query: { type: decisionMeta[kind].event, from: DateTime.fromDateUnsafe(from), limit: decisionsPageLimit } })
    const [allowed, held, blocked] = yield* Effect.all([list("allowed"), list("held"), list("blocked")], { concurrency: 3 })
    const window: DecisionWindow = { from, pages: { allowed, held, blocked } }
    return window
  })
)

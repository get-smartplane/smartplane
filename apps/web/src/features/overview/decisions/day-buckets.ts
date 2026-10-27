import type { ChainedAuditEvent } from "@pc/domain"
import { DateTime, Option, Schema } from "effect"
import { denialReasons } from "@/features/audit/denial"
import { decisionDays, decisionsPageLimit, type DecisionWindow } from "./decisions-atom"
import { decisionKinds, type DecisionKind } from "./decision-kind"

export interface DayBucket {
  readonly key: string
  readonly label: string
  readonly counts: { readonly [K in DecisionKind]: number }
  readonly total: number
}

export interface DecisionEvent {
  readonly kind: DecisionKind
  readonly event: ChainedAuditEvent
  readonly tool: string | null
  /** Why a blocked call was refused, in a sentence. */
  readonly reason: string | null
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" })

/** Seven local days, oldest first, each with its count per outcome. */
export const dayBuckets = (window: DecisionWindow): ReadonlyArray<DayBucket> =>
  Array.from({ length: decisionDays }, (_, offset) => {
    const day = new Date(window.from)
    day.setDate(day.getDate() + offset)
    const key = dayKey(day)
    const count = (kind: DecisionKind) =>
      window.pages[kind].events.filter((event) => dayKey(DateTime.toDate(event.occurredAt)) === key).length
    const counts = { allowed: count("allowed"), held: count("held"), blocked: count("blocked") }
    return { key, label: weekday.format(day), counts, total: counts.allowed + counts.held + counts.blocked }
  })

/** True when a page came back full, so its total is "at least". */
export const isCapped = (window: DecisionWindow, kind: DecisionKind) =>
  window.pages[kind].nextCursor !== null && window.pages[kind].events.length >= decisionsPageLimit

const ToolData = Schema.Struct({ tool: Schema.String })
const decodeTool = Schema.decodeUnknownOption(ToolData)

/** The newest decisions across all three outcomes, with the tool name the gateway recorded. */
export const latestDecisions = (window: DecisionWindow, count: number): ReadonlyArray<DecisionEvent> =>
  decisionKinds
    .flatMap((kind) => window.pages[kind].events.map((event) => ({ kind, event })))
    .sort((a, b) => DateTime.toEpochMillis(b.event.occurredAt) - DateTime.toEpochMillis(a.event.occurredAt))
    .slice(0, count)
    .map(({ kind, event }) => ({
      kind,
      event,
      tool: Option.getOrNull(Option.map(decodeTool(event.data), (data) => data.tool)),
      reason: kind === "blocked" ? (denialReasons(event.data)[0] ?? null) : null
    }))

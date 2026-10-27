import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ChainedAuditEvent } from "@pc/domain"
import { Effect } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect } from "react"
import { apiQuery } from "@/lib/api/atoms"

const PollMs = 3000

/**
 * The org's most recent agent activity: a tool call, or else a session listing its tools. Needs
 * `audit:read`, so only mounted for people who have it.
 */
export const agentActivityAtom = apiQuery([], (api) =>
  Effect.map(
    Effect.all([api.audit.list({ query: { type: "mcp.tool_called", limit: 1 } }), api.audit.list({ query: { type: "mcp.tools_listed", limit: 1 } })], { concurrency: 2 }),
    ([calls, sessions]): ChainedAuditEvent | null => calls.events[0] ?? sessions.events[0] ?? null
  )
)

/** Polls the audit log until an agent shows up; stops once one has, and while the tab is hidden. */
export const useFirstAgentEvent = (): ChainedAuditEvent | null => {
  const event = AsyncResult.getOrElse(useAtomValue(agentActivityAtom), () => null)
  const refresh = useAtomRefresh(agentActivityAtom)
  useEffect(() => {
    if (event !== null) return
    const timer = window.setInterval(() => document.visibilityState === "visible" && refresh(), PollMs)
    return () => window.clearInterval(timer)
  }, [event, refresh])
  return event
}

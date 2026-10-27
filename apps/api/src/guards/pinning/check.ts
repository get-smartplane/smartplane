import type { GuardPin, Principal } from "@pc/domain"
import { DateTime, Effect } from "effect"
import type { GatewayReads } from "../../mcp/gateway-reads"
import type { TargetTools } from "../grounding/tool-docs"
import type { ToolDoc } from "../grounding/tool-doc"
import { resultValues } from "./harvest"

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

/** A read tool that fetches one thing by a single required id or URL argument (`notion-fetch {id}`). */
export const fetchTool = (docs: ReadonlyArray<ToolDoc>): { readonly doc: ToolDoc; readonly arg: string } | undefined => {
  for (const doc of docs.filter((candidate) => candidate.access === "read" && /fetch|get|retrieve|read|show/i.test(candidate.name))) {
    const schema = doc.inputSchema
    const required = isRecord(schema) && Array.isArray(schema["required"]) ? schema["required"].filter((key): key is string => typeof key === "string") : []
    const [arg] = required
    if (required.length === 1 && arg !== undefined && /id|url|key/i.test(arg)) return { doc, arg }
  }
  return undefined
}

/** An error saying the thing is gone; a successful read is only "gone" when it says it is in the trash. */
const goneError = /not[ _-]?found|could not find|couldn't find|does not exist|no longer exists|\b404\b/i
const trashed = /\\?"(?:in_trash|archived|is_archived)\\?"\s*:\s*true/i

/**
 * Re-checks confirmed pins while verifying: fetches each one by id through the gateway as the admin
 * (read-only tools only) and marks it `missing` when the upstream says it is gone. A pin whose system has no
 * fetch-by-id tool, or that the admin cannot reach, keeps its last state.
 */
export const checkPins = (reads: GatewayReads["Service"], principal: Principal, pins: ReadonlyArray<GuardPin>, sets: ReadonlyArray<TargetTools>) =>
  Effect.forEach(pins, (pin) =>
    Effect.gen(function*() {
      const fetch = fetchTool(sets.filter((set) => set.target.resource.id === pin.resourceId && set.source !== "curated").flatMap((set) => set.tools))
      if (fetch === undefined) return pin
      const ran = yield* Effect.result(reads.run(principal, fetch.doc.gatewayName, { [fetch.arg]: pin.url ?? pin.entityId }))
      if (ran._tag === "Failure") return pin
      const text = JSON.stringify(resultValues(ran.success))
      const missing = ran.success.isError === true ? goneError.test(text) : trashed.test(text)
      if (ran.success.isError === true && !missing) return pin
      return { ...pin, missing, checkedAt: yield* DateTime.now }
    }), { concurrency: 3 }).pipe(Effect.withSpan("PinLookup.checkPins"))

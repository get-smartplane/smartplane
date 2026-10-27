import type { GuardPin, GuardPinLookup, Principal } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { GatewayReads } from "../../mcp/gateway-reads"
import type { ToolResult } from "../../mcp/sdk"
import { WorkersAi } from "../../platform/ai"
import { AppConfig } from "../../platform/config"
import type { TargetTools } from "../grounding/tool-docs"
import { candidatesFrom } from "./candidates"
import { checkPins } from "./check"
import { resultValues } from "./harvest"
import { pickCall, pickLookup } from "./pick-lookup"

/** Lookups answer through the gateway with the verifying admin's account; past this verify goes on without. */
const connected = (set: TargetTools) => set.source === "listing" || set.source === "catalog"

const errorText = (result: ToolResult) =>
  result.content.flatMap((block) => (typeof block["text"] === "string" ? [block["text"]] : [])).join(" ").slice(0, 200)

/**
 * Finds the specific thing a rule names inside an integration, for an admin to confirm as a pin: one small
 * model call picks a read-only tool and its arguments, the gateway runs it as the admin (read-only tools
 * only, audited and guard-checked like any call), and the objects it returns become candidates. Never pins
 * anything itself; every outcome says why when there is nothing to confirm.
 */
export class PinLookup extends Context.Service<PinLookup, {
  readonly lookup: (principal: Principal, rule: string, sets: ReadonlyArray<TargetTools>) => Effect.Effect<GuardPinLookup | undefined>
  /** Re-checks confirmed pins (see `checkPins`). */
  readonly check: (principal: Principal, pins: ReadonlyArray<GuardPin>, sets: ReadonlyArray<TargetTools>) => Effect.Effect<ReadonlyArray<GuardPin>>
}>()("api/guards/PinLookup") {
  static readonly layer = Layer.effect(
    PinLookup,
    Effect.gen(function*() {
      const ai = yield* WorkersAi
      const reads = yield* GatewayReads
      const call = pickCall((yield* AppConfig).COMPILER_MODEL)

      const lookup = Effect.fn("PinLookup.lookup")(function*(principal: Principal, rule: string, sets: ReadonlyArray<TargetTools>) {
        if (sets.length === 0) return undefined
        const readTools = sets.flatMap((set) => set.tools.filter((doc) => doc.access === "read"))
        const picked = yield* Effect.result(pickLookup(ai, call, rule, readTools))
        if (picked._tag === "Failure") {
          const detail = picked.failure._tag === "ModelTimedOut" ? "The lookup took too long; verify again to retry." : "The lookup could not decide what the rule names."
          return { status: "failed", candidates: [], detail } satisfies GuardPinLookup
        }
        const { mention, tool, arguments: args = {} } = picked.success
        if (mention === null || mention.trim() === "") return { status: "not_specific", candidates: [] } satisfies GuardPinLookup
        const doc = readTools.find((candidate) => candidate.gatewayName === tool || candidate.name === tool)
        const base = { mention: mention.slice(0, 200), candidates: [] }
        if (doc === undefined) return { ...base, status: "no_lookup_tool", detail: "None of its read-only tools can look it up." } satisfies GuardPinLookup
        const set = sets.find((candidate) => candidate.tools.includes(doc))
        if (set !== undefined && !connected(set)) {
          return { ...base, status: "no_connection", resourceId: doc.resourceId, detail: `Connect your ${doc.product} account to look it up.` } satisfies GuardPinLookup
        }
        const ran = yield* Effect.result(reads.run(principal, doc.gatewayName, args))
        const found = { ...base, resourceId: doc.resourceId, tool: doc.gatewayName }
        if (ran._tag === "Failure") return { ...found, status: "no_connection", detail: `The lookup could not run as you: ${ran.failure.reason}.` } satisfies GuardPinLookup
        if (ran.success.isError === true) {
          const text = errorText(ran.success)
          return { ...found, status: /connect/i.test(text) ? "no_connection" : "failed", detail: text } satisfies GuardPinLookup
        }
        const candidates = candidatesFrom(resultValues(ran.success), doc.resourceId, mention, doc.product === "" ? "item" : `${doc.product} item`)
        return { ...found, status: candidates.length === 0 ? "none_found" : "found", candidates } satisfies GuardPinLookup
      })

      return PinLookup.of({ lookup, check: (principal, pins, sets) => checkPins(reads, principal, pins, sets) })
    })
  )
}

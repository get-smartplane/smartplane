import type { AuditTarget, Principal } from "@pc/domain"
import { Clock, Context, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { GuardEvaluator } from "../guards/evaluator"
import { PinChildren } from "../guards/pinning/children-store"
import { noPins, type PinView } from "../guards/pinning/context"
import { harvestResult } from "../guards/pinning/harvest-step"
import type { GatewayTool } from "./provider"
import { notConnectedResult, refusalText } from "./refusal"
import { toolSummaryOf } from "./tool-summary"
import { textResult, type ToolResult } from "./sdk"

const AuditUnavailableText = "Smartplane could not record this call in its audit log, so it did not run it. Try again in a minute."

/**
 * The one path every gateway tool call takes, whatever its provider: argument and grant checks, then
 * guards (the ones whose scope and call filter cover the call, in one Clef call; none, no call), then
 * execution with injected credentials. Every outcome is audited.
 */
export class ToolPipeline extends Context.Service<ToolPipeline, {
  /** `via` names the meta-tool a call came through (`smartplane__call_tool`); the audit still names the real tool. */
  readonly run: (principal: Principal, tool: GatewayTool, args: Readonly<Record<string, unknown>>, via?: string) => Effect.Effect<ToolResult>
}>()("api/mcp/ToolPipeline") {
  static readonly layer = Layer.effect(
    ToolPipeline,
    Effect.gen(function*() {
      const guards = yield* GuardEvaluator
      const audit = yield* AuditLog
      const children = yield* PinChildren

      const run = Effect.fn("ToolPipeline.run")(function*(principal: Principal, tool: GatewayTool, args: Readonly<Record<string, unknown>>, via?: string) {
        const target: AuditTarget | null = tool.target === null ? null : { type: "resource", id: tool.target.id }
        const base = { tool: tool.operation, gatewayTool: tool.definition.name, ...(via === undefined ? {} : { via }) }
        yield* Effect.annotateCurrentSpan({ "mcp.tool": tool.definition.name, "mcp.builtin": tool.target === null })

        const prepared = yield* Effect.result(tool.prepare(args))
        if (prepared._tag === "Failure") {
          const failure = prepared.failure
          if (failure._tag === "PolicyDenied") {
            yield* audit.by(principal, "policy.denied", target, { ...base, arguments: args, reasons: failure.reasons })
            return textResult(refusalText({ _tag: "Deny", reasons: failure.reasons }), true)
          }
          if (failure._tag === "AccountNotConnected") {
            const reasons = [{ _tag: "NotConnected", resourceId: failure.resourceId }]
            yield* audit.by(principal, "policy.denied", target, { ...base, arguments: args, reasons, connectUrl: failure.connectUrl })
            return notConnectedResult(failure)
          }
          yield* audit.by(principal, "mcp.tool_called", target, { ...base, arguments: args, rejected: failure.message, isError: true })
          return textResult(`Invalid arguments: ${failure.message}`, true)
        }
        // Calls through a connected account record which account it was, beside the acting principal.
        const connection = prepared.success.connection ?? null
        const call = { ...base, arguments: prepared.success.arguments, ...(connection === null ? {} : { connection }) }

        let scores: Readonly<Record<string, number>> = {}
        let pins: PinView = noPins
        // Which guards judged the call and how many were skipped in code, so a skipped rule is visible in the log.
        let checked: Readonly<Record<string, unknown>> = {}
        if (tool.target !== null) {
          const { title, description, access } = toolSummaryOf(tool.definition)
          const toolInfo = { gatewayName: tool.definition.name, title, description, access }
          const evaluation = yield* guards.evaluate(principal, { resource: tool.target, tool: tool.operation, arguments: call.arguments, connection, toolInfo })
          const { decision } = evaluation
          scores = evaluation.scores
          pins = evaluation.pins ?? noPins
          checked = evaluation.guards === undefined ? {} : { guards: evaluation.guards }
          if (decision._tag === "Deny") {
            yield* audit.by(principal, "policy.denied", target, { ...call, ...checked, reasons: decision.reasons, scores, ...(evaluation.certain === undefined ? {} : { certain: evaluation.certain }) })
            return textResult(refusalText(decision), true)
          }
          if (decision._tag === "PendingApproval") {
            yield* audit.by(principal, "policy.pending_approval", target, { ...call, ...checked, approvalId: decision.approvalId, guardId: decision.guardId, scores })
            return textResult(refusalText(decision), true)
          }
          if (decision.flaggedBy.length > 0) yield* audit.by(principal, "policy.flagged", target, { ...call, ...checked, flaggedBy: decision.flaggedBy, scores })
        }

        // Fail closed: a call whose intent cannot be recorded never reaches the upstream.
        const intent = yield* Effect.result(audit.writeBy(principal, "mcp.tool_call_started", target, { ...call, ...checked, scores }))
        if (intent._tag === "Failure") return textResult(AuditUnavailableText, true)
        const outcomeOf = { ...call, ...checked, startedEventId: intent.success.id, scores }
        // The intent event already proves the call; failing here would make the agent repeat a side effect.
        const recordOutcome = (data: Readonly<Record<string, unknown>>) =>
          audit.writeBy(principal, "mcp.tool_called", target, { ...outcomeOf, ...data }).pipe(Effect.ignore)

        const started = yield* Clock.currentTimeMillis
        const outcome = yield* Effect.result(prepared.success.execute)
        const ms = (yield* Clock.currentTimeMillis) - started
        if (outcome._tag === "Failure") {
          yield* recordOutcome({ ms, error: outcome.failure.message })
          return textResult(`Upstream error: ${outcome.failure.message}`, true)
        }
        yield* recordOutcome({ ms, isError: outcome.success.isError ?? false })
        yield* harvestResult(children, principal.orgId, pins, outcome.success)
        return outcome.success
      })

      return ToolPipeline.of({ run })
    })
  )
}

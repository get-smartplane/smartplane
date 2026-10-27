import type { ConnectionContext, Decision, GuardId, Principal, Resource } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { exemptFromApproval } from "../access/approval-routing"
import { actorState, connectionState, identityNeeds } from "./applies/identity"
import { type GuardsChecked, selectGuards } from "./applies/match"
import { Approvals } from "../access/approvals"
import { TeamsRepo } from "../org/teams-repo"
import { Classifier } from "./classifier"
import { classifierState, type ToolInfo } from "./classifier-state"
import { applicableGuards, decide, questionFor, type Scores } from "./evaluation"
import { productName } from "./grounding/products"
import { GuardsRepo } from "./guards-repo"
import { PinChildren } from "./pinning/children-store"
import { contextLine, noPins, pinnedContext, type PinView, pinView } from "./pinning/context"
import { CreateInPinProbability, createsInPin } from "./pinning/create-in-pin"

/** An agent action proposed through the MCP gateway. */
export interface ProposedAction {
  readonly resource: Resource
  readonly tool: string
  readonly arguments: unknown
  /** The account the call goes through; `null` or absent when the resource needs none. */
  readonly connection?: ConnectionContext | null
  /** The tool's title and description, so the classifier knows what an opaque call does. */
  readonly toolInfo?: ToolInfo
}

export interface Evaluation {
  readonly decision: Decision
  /** Violation probability per evaluated guard, for the audit trail. */
  readonly scores: Readonly<Record<string, number>>
  /** Pins on the called resource: which the call touched, and what to harvest from its result. */
  readonly pins?: PinView
  /** Guards decided without the classifier because the call certainly creates inside their pin (see `createsInPin`). */
  readonly certain?: ReadonlyArray<GuardId>
  /** How many active guards judged the call and how many their scope or call filter skipped, for the audit. */
  readonly guards?: GuardsChecked
}

/**
 * Evaluates every guard that applies to an action in a single Clef call. Which guards apply is decided in
 * code first (resource scope, then each guard's accepted call filter); with none, Clef is not called.
 */
export class GuardEvaluator extends Context.Service<GuardEvaluator, {
  readonly evaluate: (principal: Principal, action: ProposedAction) => Effect.Effect<Evaluation>
}>()("api/guards/GuardEvaluator") {
  static readonly layer = Layer.effect(
    GuardEvaluator,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const classifier = yield* Classifier
      const approvals = yield* Approvals
      const teams = yield* TeamsRepo
      const children = yield* PinChildren

      const evaluate = Effect.fn("GuardEvaluator.evaluate")(function*(principal: Principal, action: ProposedAction) {
        // "Without my permission": the author's own actions carry that permission, so such a guard only
        // flags them (monitor) instead of holding them. See `exemptFromApproval`.
        const active = yield* guards.active(principal.orgId)
        const { evaluated, checked } = selectGuards(applicableGuards(active, action.resource), active.length, {
          resourceId: action.resource.id,
          tool: action.tool,
          access: action.toolInfo?.access,
          principal
        })
        const applicable = evaluated.map((guard) =>
          guard.mode === "require_approval" && exemptFromApproval(guard, principal) ? { ...guard, mode: "monitor" as const } : guard
        )
        // Pins of every active guard on this resource: their items are harvested from results even when no
        // guard applies to this particular call.
        const pinned = active.filter((guard) => guard.pins.some((pin) => pin.resourceId === action.resource.id))
        const pins = pinned.length === 0
          ? noPins
          : pinView(pinned, action.resource.id, yield* children.get(principal.orgId, pinned.flatMap((guard) => guard.pins.map((pin) => pin.id))), action.arguments, productName(action.resource))
        yield* Effect.annotateCurrentSpan({ "guards.applicable": applicable.length, "guards.skipped": checked.skipped, "guards.pins_touched": pins.calledOn.size })
        if (applicable.length === 0) return { decision: { _tag: "Allow", flaggedBy: [] }, scores: {}, pins, guards: checked } satisfies Evaluation

        const questions = new Map(applicable.flatMap((guard) => {
          if (!guard.compiled) return []
          const line = contextLine(pins, guard.id)
          return [[guard.id, line === undefined ? questionFor(guard.compiled) : `${questionFor(guard.compiled)}\n\n${line}`]]
        }))
        // Rules name teams ("except finance"); ids alone would leave the classifier guessing. Emails and account
        // identities are personal data: sent only when a guard judging this call names people or that account.
        const teamNames = principal.teamIds.length === 0 ? [] : (yield* teams.list(principal.orgId)).filter((team) => principal.teamIds.includes(team.id)).map((team) => team.name)
        const needs = identityNeeds(applicable)
        const state = classifierState({
          actor: actorState(principal, teamNames, needs),
          resource: action.resource,
          tool: action.tool,
          toolInfo: action.toolInfo,
          arguments: action.arguments,
          connection: connectionState(action.connection ?? null, needs),
          pinned: pinnedContext(pins)
        })
        // Classifier failure is not an error here: `decide` turns missing scores into fail-closed denials.
        const scores: Scores = yield* classifier.classify(state, questions).pipe(
          Effect.catchTag("UpstreamFailure", (failure) =>
            Effect.as(Effect.logWarning("guard classifier unavailable", failure.message), undefined))
        )
        // A pin and the tool's own semantics can make the answer certain; it then holds even with the classifier down.
        const certain = applicable.filter((guard) =>
          createsInPin({ tool: action.tool, access: action.toolInfo?.access, arguments: action.arguments, operations: guard.compiled?.operations }, pins.pinsOf.get(guard.id) ?? []) !== undefined
        ).map((guard) => guard.id)
        const decided: Scores = certain.length === 0 ? scores : new Map([...(scores ?? []), ...certain.map((id) => [id, CreateInPinProbability] as const)])
        const recorded = Object.fromEntries(decided ?? [])
        const verdict = decide(applicable, decided)
        const extra = { guards: checked, ...(certain.length === 0 ? {} : { certain }) }

        if (verdict._tag === "Allow") return { decision: verdict, scores: recorded, pins, ...extra }
        if (verdict._tag === "Deny") return { decision: verdict, scores: recorded, pins, ...extra }
        const approval = yield* approvals.request(principal, verdict.guardId, {
          resourceId: action.resource.id,
          tool: action.tool,
          arguments: action.arguments
        })
        const decision: Decision = approval.status === "consumed"
          ? { _tag: "Allow", flaggedBy: verdict.flaggedBy }
          : { _tag: "PendingApproval", approvalId: approval.id, guardId: verdict.guardId }
        return { decision, scores: recorded, pins, ...extra }
      })

      return GuardEvaluator.of({ evaluate })
    })
  )
}

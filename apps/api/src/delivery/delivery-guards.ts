import type { DeliveryCaller, DeliveryPurpose, DenyReason, EnvName, Guard, GuardId, OrgId, Resource, ResourceId } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { Classifier } from "../guards/classifier"
import { applicableGuards, decide, questionFor, type Scores } from "../guards/evaluation"
import { GuardsRepo } from "../guards/guards-repo"
import { TeamsRepo } from "../org/teams-repo"

/** One secret or variable about to be delivered. */
export interface DeliveryAction {
  readonly resource: Resource
  readonly name: EnvName
  readonly purpose: DeliveryPurpose
}

export type DeliveryVerdict =
  | { readonly _tag: "Allow"; readonly flaggedBy: ReadonlyArray<GuardId>; readonly scores: Readonly<Record<string, number>> }
  | { readonly _tag: "Deny"; readonly reasons: ReadonlyArray<DenyReason>; readonly scores: Readonly<Record<string, number>> }

/** The guarded action's name, as rules and their examples refer to it. */
export const DeliverAction = "secret.deliver"

/**
 * Nobody is around to approve a delivery while a process waits at boot, so an approval guard is held to its
 * rule as if it enforced: it denies. Monitor guards only flag.
 */
const asDeliveryGuard = (guard: Guard): Guard => (guard.mode === "require_approval" ? { ...guard, mode: "enforce" } : guard)

/**
 * Checks deliveries against active guards scoped to the resource (or org-wide), with the action
 * `secret.deliver` and arguments `{ name, purpose, tokenKind, machineName? }`. Fails closed through `decide`:
 * an enforcing guard without an answer (classifier down) denies. The gateway's evaluator is not involved.
 */
export class DeliveryGuards extends Context.Service<DeliveryGuards, {
  readonly evaluate: (orgId: OrgId, caller: DeliveryCaller, actions: ReadonlyArray<DeliveryAction>) => Effect.Effect<ReadonlyMap<ResourceId, DeliveryVerdict>>
}>()("api/delivery/DeliveryGuards") {
  static readonly layer = Layer.effect(
    DeliveryGuards,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const classifier = yield* Classifier
      const teams = yield* TeamsRepo

      const actorOf = Effect.fn("DeliveryGuards.actorOf")(function*(orgId: OrgId, caller: DeliveryCaller) {
        if (caller._tag === "Machine") {
          const { token } = caller
          return { type: "MachineToken", name: token.name, project: token.projectId, createdBy: token.createdBy }
        }
        const { principal } = caller
        // Rules name teams ("outside the deploy team"); ids alone would leave the classifier guessing.
        const teamNames = principal.teamIds.length === 0 ? [] : (yield* teams.list(orgId)).filter((team) => principal.teamIds.includes(team.id)).map((team) => team.name)
        return {
          type: principal._tag,
          ...(principal._tag === "User" ? { email: principal.email } : { name: principal.name }),
          role: principal.role,
          teams: principal.teamIds,
          teamNames,
          project: principal.projectId
        }
      })

      const evaluate = Effect.fn("DeliveryGuards.evaluate")(function*(orgId: OrgId, caller: DeliveryCaller, actions: ReadonlyArray<DeliveryAction>) {
        const active = yield* guards.active(orgId)
        const verdicts = new Map<ResourceId, DeliveryVerdict>()
        if (active.length === 0) return verdicts
        const actor = yield* actorOf(orgId, caller)
        yield* Effect.forEach(actions, (action) =>
          Effect.gen(function*() {
            const applicable = applicableGuards(active, action.resource).map(asDeliveryGuard)
            if (applicable.length === 0) return
            const questions = new Map(applicable.flatMap((guard) => (guard.compiled ? [[guard.id, questionFor(guard.compiled)]] : [])))
            const state = {
              actor,
              resource: { kind: action.resource.config.kind, name: action.resource.name, description: action.resource.description },
              tool: DeliverAction,
              arguments: {
                name: action.name,
                purpose: action.purpose,
                tokenKind: caller._tag === "Machine" ? "machine" : "user",
                ...(caller._tag === "Machine" ? { machineName: caller.token.name } : {})
              }
            }
            const scores: Scores = yield* classifier.classify(state, questions).pipe(
              Effect.catchTag("UpstreamFailure", (failure) => Effect.as(Effect.logWarning("guard classifier unavailable", failure.message), undefined))
            )
            const recorded = Object.fromEntries(scores ?? [])
            const verdict = decide(applicable, scores)
            verdicts.set(action.resource.id, verdict._tag === "Deny"
              ? { _tag: "Deny", reasons: verdict.reasons, scores: recorded }
              : { _tag: "Allow", flaggedBy: verdict.flaggedBy, scores: recorded })
          }), { concurrency: 4, discard: true })
        yield* Effect.annotateCurrentSpan({ "guards.evaluated": verdicts.size })
        return verdicts
      })

      return DeliveryGuards.of({ evaluate })
    })
  )
}

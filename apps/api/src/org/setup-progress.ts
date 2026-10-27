import {
  type Forbidden,
  type GuardId,
  hasPermission,
  initialOrgSetup,
  type MemberWelcome,
  NotFound,
  type OnboardingProgress,
  OrgSetup,
  type Principal,
  type ResourceId,
  SetupStep,
  type UpdateMemberWelcome,
  type UpdateOrgSetup
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { GuardsRepo } from "../guards/guards-repo"
import { ResourcesRepo } from "../resources/resources-repo"
import { OnboardingRepo } from "./onboarding-repo"

/** Running the org's setup means adding tools, grants and rules, so it takes the resource admin permission. */
const SetupPermission = "resources:manage"

/** Owners created the org and ran its setup; everyone else gets the welcome once. */
const defaultWelcome = (principal: Principal): MemberWelcome => ({ status: principal.role === "owner" ? "completed" : "pending", updatedAt: null })

/** Only the fields that change, so the audit event says what happened rather than restating the state. */
const changesOf = (before: OrgSetup, input: UpdateOrgSetup): Readonly<Record<string, unknown>> => {
  const steps = SetupStep.literals.flatMap((step) => {
    const state = input.steps?.[step]
    return state === undefined || state === before.steps[step] ? [] : [[step, state] as const]
  })
  return {
    ...(input.status !== undefined && input.status !== before.status ? { status: input.status } : {}),
    ...(steps.length > 0 ? { steps: Object.fromEntries(steps) } : {}),
    ...(input.toolResourceId !== undefined && input.toolResourceId !== before.toolResourceId ? { toolResourceId: input.toolResourceId } : {}),
    ...(input.guardId !== undefined && input.guardId !== before.guardId ? { guardId: input.guardId } : {})
  }
}

/** Onboarding progress: the org's setup flow and each member's welcome. Every change is audited. */
export class SetupProgress extends Context.Service<SetupProgress, {
  readonly get: (principal: Principal) => Effect.Effect<OnboardingProgress, Forbidden>
  readonly updateSetup: (principal: Principal, input: UpdateOrgSetup) => Effect.Effect<OrgSetup, Forbidden | NotFound>
  readonly updateWelcome: (principal: Principal, input: UpdateMemberWelcome) => Effect.Effect<MemberWelcome, Forbidden>
}>()("api/org/SetupProgress") {
  static readonly layer = Layer.effect(
    SetupProgress,
    Effect.gen(function*() {
      const repo = yield* OnboardingRepo
      const resources = yield* ResourcesRepo
      const guards = yield* GuardsRepo
      const audit = yield* AuditLog

      const currentSetup = (principal: Principal) => Effect.map(repo.setup(principal.orgId), Option.getOrElse(initialOrgSetup))

      // Pointers must name something in this org; null clears them.
      const checkResource = (principal: Principal, id: ResourceId | null | undefined) =>
        id == null ? Effect.void : Effect.flatMap(resources.find(principal.orgId, id), (found) => Option.isSome(found) ? Effect.void : Effect.fail(new NotFound({ entity: "resource", id })))
      const checkGuard = (principal: Principal, id: GuardId | null | undefined) =>
        id == null ? Effect.void : Effect.flatMap(guards.find(principal.orgId, id), (found) => Option.isSome(found) ? Effect.void : Effect.fail(new NotFound({ entity: "guard", id })))

      const get = Effect.fn("SetupProgress.get")(function*(principal: Principal) {
        const user = yield* requireUser(principal)
        const setup = hasPermission(principal, SetupPermission) ? yield* currentSetup(principal) : null
        const welcome = Option.getOrElse(yield* repo.welcome(principal.orgId, user.userId), () => defaultWelcome(principal))
        const progress: OnboardingProgress = { setup, welcome }
        return progress
      })

      const updateSetup = Effect.fn("SetupProgress.updateSetup")(function*(principal: Principal, input: UpdateOrgSetup) {
        yield* requirePermission(principal, SetupPermission)
        const user = yield* requireUser(principal)
        yield* checkResource(principal, input.toolResourceId)
        yield* checkGuard(principal, input.guardId)
        const before = yield* currentSetup(principal)
        const changes = changesOf(before, input)
        if (Object.keys(changes).length === 0) return before
        const next = OrgSetup.make({
          status: input.status ?? before.status,
          steps: { ...before.steps, ...input.steps },
          toolResourceId: input.toolResourceId === undefined ? before.toolResourceId : input.toolResourceId,
          guardId: input.guardId === undefined ? before.guardId : input.guardId,
          updatedAt: yield* DateTime.now
        })
        yield* repo.saveSetup(principal.orgId, next, user.userId)
        yield* audit.by(principal, "onboarding.updated", { type: "org", id: principal.orgId }, { flow: "setup", ...changes })
        return next
      })

      const updateWelcome = Effect.fn("SetupProgress.updateWelcome")(function*(principal: Principal, input: UpdateMemberWelcome) {
        const user = yield* requireUser(principal)
        const welcome: MemberWelcome = { status: input.status, updatedAt: yield* DateTime.now }
        yield* repo.saveWelcome(principal.orgId, user.userId, welcome)
        yield* audit.by(principal, "onboarding.updated", { type: "member", id: user.membershipId }, { flow: "welcome", status: input.status })
        return welcome
      })

      return SetupProgress.of({ get, updateSetup, updateWelcome })
    })
  )
}

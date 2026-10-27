import { type CreateGuardFromStarter, type Forbidden, type Guard, type GuardVerifyRun, nameFromRule, NotFound, type Principal } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../../audit/audit-log"
import { requirePermission, requireUser } from "../../auth/permissions"
import { ProjectsRepo } from "../../org/projects-repo"
import { Ids } from "../../platform/ids"
import { ResourcesRepo } from "../../resources/resources-repo"
import { checkScope } from "../guard-scope"
import { GuardsRepo } from "../guards-repo"
import { newRunId } from "../verify-job/job"
import { starterFor } from "./catalog"
import { appliesOf, compiledOf } from "./starter"

export const preparedNote = "A prepared rule: Smartplane wrote and tested its check ahead of time, so it needed no verify run."

/**
 * Guards from prepared rules (`starters/catalog.ts`). The check was written and tested against the real
 * classifier ahead of time, so the guard is saved compiled, with a verify run recorded as `done` that says so.
 * It stays a draft: switching it on is still a person's decision, and audited as for any rule.
 */
export class GuardStarters extends Context.Service<GuardStarters, {
  readonly create: (principal: Principal, input: CreateGuardFromStarter) => Effect.Effect<Guard, Forbidden | NotFound>
}>()("api/guards/GuardStarters") {
  static readonly layer = Layer.effect(
    GuardStarters,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const resources = yield* ResourcesRepo
      const projects = yield* ProjectsRepo
      const audit = yield* AuditLog

      const create = Effect.fn("GuardStarters.create")(function*(principal: Principal, input: CreateGuardFromStarter) {
        yield* requirePermission(principal, "guards:manage")
        const user = yield* requireUser(principal)
        const starter = starterFor(input.starterId)
        if (starter === undefined) return yield* new NotFound({ entity: "guard", id: `starter: ${input.starterId}` })
        yield* checkScope({ projects, resources }, principal.orgId, input.projectId, input.resourceIds)
        const now = yield* DateTime.now
        const compiled = compiledOf(starter)
        const run: GuardVerifyRun = { runId: newRunId(), stage: "done", startedAt: now, updatedAt: now, timeline: [{ stage: "done", at: now }], note: preparedNote }
        const guard: Guard = {
          id: yield* Ids.guard,
          orgId: principal.orgId,
          projectId: input.projectId,
          resourceIds: input.resourceIds,
          name: nameFromRule(starter.rule),
          nameFollowsRule: true,
          rule: starter.rule,
          mode: input.mode ?? compiled.suggestion?.mode ?? "enforce",
          modeFollowsRule: false,
          approvers: [],
          threshold: input.threshold,
          status: "draft",
          compiled,
          compiledVersion: 1,
          testCalls: [],
          pins: [],
          applies: appliesOf(starter, input.resourceIds),
          verify: run,
          createdBy: user.userId,
          createdAt: now,
          updatedAt: null
        }
        yield* guards.insert(guard)
        yield* Effect.annotateCurrentSpan({ "guard.id": guard.id, "guard.starter": starter.id })
        // The same two events a typed rule leaves once verified, so the history reads alike.
        yield* audit.by(principal, "guard.created", { type: "guard", id: guard.id }, { name: guard.name, rule: guard.rule, mode: guard.mode, starter: starter.id })
        yield* audit.by(principal, "guard.compiled", { type: "guard", id: guard.id }, { version: guard.compiledVersion, runId: run.runId, compiled, starter: starter.id, prepared: true })
        return guard
      })

      return GuardStarters.of({ create })
    })
  )
}

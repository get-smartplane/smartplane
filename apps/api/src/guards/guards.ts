import {
  Conflict,
  type CreateGuard,
  type Forbidden,
  type Guard,
  type GuardId,
  type GuardTestCase,
  type GuardTestResult,
  hasPermission,
  NotFound,
  type Principal,
  type UpdateGuard,
  type UpstreamFailure,
  verifyActive
} from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { MembersRepo } from "../org/members-repo"
import { ProjectsRepo } from "../org/projects-repo"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { Ids } from "../platform/ids"
import { ResourceVisibility } from "../resources/resource-visibility"
import { ResourcesRepo } from "../resources/resources-repo"
import { Classifier } from "./classifier"
import { questionFor } from "./evaluation"
import { makeGuardDirectory } from "./guard-directory"
import { applyEdits, initialMode, initialName } from "./guard-edits"
import { checkScope } from "./guard-scope"
import { GuardsRepo } from "./guards-repo"
import { VerifyRuns } from "./verify-job/runs"
import { visibleGuards } from "./visible-guards"

/** Stages before a run's draft is final: activating then would enforce a version about to be replaced. */
const draftPending: ReadonlyArray<string> = ["queued", "finding_targets", "drafting", "reviewing"]

export class Guards extends Context.Service<Guards, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<Guard>, Forbidden>
  readonly create: (principal: Principal, input: CreateGuard) => Effect.Effect<Guard, Forbidden | NotFound>
  readonly get: (principal: Principal, id: GuardId) => Effect.Effect<Guard, Forbidden | NotFound>
  /** Starts a verify run and answers with the guard carrying it; the stages run in the background. */
  readonly compile: (principal: Principal, id: GuardId) => Effect.Effect<Guard, Forbidden | NotFound | UpstreamFailure>
  readonly cancelVerify: (principal: Principal, id: GuardId) => Effect.Effect<Guard, Forbidden | NotFound | Conflict>
  /** Tests a run paused for a pin confirmation without pinning anything. */
  readonly continueVerify: (principal: Principal, id: GuardId) => Effect.Effect<Guard, Forbidden | NotFound | Conflict | UpstreamFailure>
  readonly test: (principal: Principal, id: GuardId, sample: GuardTestCase) => Effect.Effect<GuardTestResult, Forbidden | NotFound | Conflict | UpstreamFailure>
  readonly update: (principal: Principal, id: GuardId, input: UpdateGuard) => Effect.Effect<Guard, Forbidden | NotFound | Conflict>
}>()("api/guards/Guards") {
  static readonly layer = Layer.effect(
    Guards,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const resources = yield* ResourcesRepo
      const projects = yield* ProjectsRepo
      const teams = yield* TeamsRepo
      const runs = yield* VerifyRuns
      const classifier = yield* Classifier
      const audit = yield* AuditLog
      const visibility = yield* ResourceVisibility
      const { compileContext, checkApprovers } = makeGuardDirectory({ resources, teams, members: yield* MembersRepo, roles: yield* RolesRepo })

      const load = (principal: Principal, id: GuardId) =>
        guards.find(principal.orgId, id).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.mapError(() => new NotFound({ entity: "guard", id }))
        )

      const create = Effect.fn("Guards.create")(function*(principal: Principal, input: CreateGuard) {
        yield* requirePermission(principal, "guards:manage")
        const user = yield* requireUser(principal)
        yield* checkScope({ projects, resources }, principal.orgId, input.projectId, input.resourceIds)
        const approvers = input.approvers ?? []
        yield* checkApprovers(principal.orgId, approvers)
        const guard: Guard = {
          id: yield* Ids.guard,
          orgId: principal.orgId,
          ...input,
          ...initialName(input),
          ...initialMode(input),
          approvers,
          applies: null,
          testCalls: [],
          pins: [],
          verify: null,
          status: "draft",
          compiled: null,
          compiledVersion: 0,
          createdBy: user.userId,
          createdAt: yield* DateTime.now,
          updatedAt: null
        }
        yield* guards.insert(guard)
        yield* audit.by(principal, "guard.created", { type: "guard", id: guard.id }, { name: guard.name, rule: guard.rule, mode: guard.mode, ...(guard.modeFollowsRule && { modeFollowsRule: true }) })
        return guard
      })

      const compile = Effect.fn("Guards.compile")(function*(principal: Principal, id: GuardId) {
        yield* requirePermission(principal, "guards:manage")
        // Checked again by each stage, as the admin is then: losing the permission mid-run stops it.
        yield* requireUser(principal)
        return yield* runs.start(principal, yield* load(principal, id))
      })

      const cancelVerify = Effect.fn("Guards.cancelVerify")(function*(principal: Principal, id: GuardId) {
        yield* requirePermission(principal, "guards:manage")
        const guard = yield* load(principal, id)
        const cancelled = yield* runs.cancel(guard, "Cancelled.")
        yield* audit.by(principal, "guard.updated", { type: "guard", id }, { verifyCancelled: guard.verify?.runId })
        return cancelled
      })

      const continueVerify = Effect.fn("Guards.continueVerify")(function*(principal: Principal, id: GuardId) {
        yield* requirePermission(principal, "guards:manage")
        const guard = yield* load(principal, id)
        if (guard.verify?.stage !== "needs_confirmation") return yield* new Conflict({ message: "this rule's verify is not waiting for a confirmation" })
        return yield* runs.resume(guard)
      })

      const test = Effect.fn("Guards.test")(function*(principal: Principal, id: GuardId, sample: GuardTestCase) {
        yield* requirePermission(principal, "guards:manage")
        const guard = yield* load(principal, id)
        if (guard.compiled === null) return yield* new Conflict({ message: "compile the guard before testing it" })
        const scores = yield* classifier.classify(sample, new Map([[guard.id, questionFor(guard.compiled)]]))
        const probability = scores.get(guard.id) ?? 1
        yield* audit.by(principal, "guard.tested", { type: "guard", id }, { tool: sample.tool, probability })
        return { probability, threshold: guard.threshold, violates: probability >= guard.threshold }
      })

      const update = Effect.fn("Guards.update")(function*(principal: Principal, id: GuardId, input: UpdateGuard) {
        yield* requirePermission(principal, "guards:manage")
        const guard = yield* load(principal, id)
        if (input.approvers !== undefined) yield* checkApprovers(principal.orgId, input.approvers)
        const named = [...(input.resourceIds ?? []), ...(input.applies?.resourceIds ?? []), ...(input.applies?.tools ?? []).map((scope) => scope.resourceId)]
        if (named.length > 0) {
          const found = yield* resources.findMany(principal.orgId, [...new Set(named)])
          const missing = named.find((resourceId) => !found.some((resource) => resource.id === resourceId))
          if (missing !== undefined) return yield* new NotFound({ entity: "resource", id: missing })
        }
        // Actor references must name this org's roles, teams and members, like approvers.
        if (input.applies?.actors !== undefined) yield* checkApprovers(principal.orgId, input.applies.actors.refs)
        const next: Guard = { ...applyEdits(guard, input), updatedAt: yield* DateTime.now }
        if (input.status === "active" && next.compiled === null) {
          return yield* new Conflict({ message: "compile and review the guard before activating it" })
        }
        if (input.status === "active" && guard.verify !== null && draftPending.includes(guard.verify.stage)) {
          return yield* new Conflict({ message: "a verify is writing a new draft; wait for it or cancel it before activating" })
        }
        yield* guards.save(next)
        // The run verifies the old wording; its results must not land on the new one.
        const ended = next.rule !== guard.rule && verifyActive(guard.verify)
          ? yield* runs.cancel(next, "The rule changed while it was being verified. Verify again.").pipe(Effect.orElseSucceed(() => next))
          : next
        yield* audit.by(principal, "guard.updated", { type: "guard", id }, { ...input, ...(next.name !== guard.name && { name: next.name }) })
        return ended
      })

      return Guards.of({
        list: Effect.fn("Guards.list")(function*(principal: Principal) {
          yield* requirePermission(principal, "resources:read")
          const all = yield* guards.list(principal.orgId)
          if (hasPermission(principal, "guards:manage") || hasPermission(principal, "resources:manage")) return all
          const visible = yield* visibility.visibleIds(principal, [...new Set(all.flatMap((guard) => guard.resourceIds))])
          return visibleGuards(all, visible)
        }),
        get: Effect.fn("Guards.get")(function*(principal: Principal, id: GuardId) {
          yield* requirePermission(principal, "resources:read")
          const guard = yield* load(principal, id)
          if (hasPermission(principal, "guards:manage") || hasPermission(principal, "resources:manage")) return guard
          const visible = yield* visibility.visibleIds(principal, guard.resourceIds)
          const [shown] = visibleGuards([guard], visible)
          return shown ?? (yield* new NotFound({ entity: "guard", id }))
        }),
        create,
        compile,
        cancelVerify,
        continueVerify,
        test,
        update
      })
    })
  )
}

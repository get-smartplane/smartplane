import {
  type AuditEvent,
  type DeliverSecretsRequest,
  type DeliveryCaller,
  type GuardMode,
  GuardId,
  type Principal,
  type ProjectId,
  type Resource,
  type ResourceId,
  RoleSlug,
  UpstreamFailure
} from "@pc/domain"
import { DateTime, Effect, Layer, Redacted as R } from "effect"
import { TokenAuthenticator } from "../access/token-auth"
import { Principals } from "../auth/principals"
import { UsersRepo } from "../auth/users-repo"
import { ConnectionsRepo } from "../connections/connections-repo"
import { DeliveryGuards } from "../delivery/delivery-guards"
import { DeliverySettings } from "../delivery/delivery-settings"
import { MachineTokenAuthenticator } from "../delivery/machine-token-auth"
import { MachineTokens } from "../delivery/machine-tokens"
import { MachineTokensRepo } from "../delivery/machine-tokens-repo"
import { RateLimiter } from "../delivery/rate-limiter"
import { SecretDelivery } from "../delivery/secret-delivery"
import { Classifier } from "../guards/classifier"
import { GuardsRepo } from "../guards/guards-repo"
import { Offboarding } from "../org/offboarding"
import { OrgsRepo } from "../org/orgs-repo"
import { Resources } from "../resources/resources"
import { now, orgId, userId, userPrincipal } from "./fixtures"
import { resourceServices } from "./resource-world"
import { insertRow } from "./seed"

/** What the fake classifier answers: violation probabilities by guard id (missing ids score 0), or "down". */
export interface ClassifierAnswers {
  current: ReadonlyMap<string, number> | "down"
  readonly asked: Array<unknown>
}

export const classifierAnswers = (): ClassifierAnswers => ({ current: new Map(), asked: [] })

const fakeClassifier = (answers: ClassifierAnswers) =>
  Layer.succeed(Classifier, Classifier.of({
    classify: (state, questions) =>
      Effect.suspend(() => {
        answers.asked.push(state)
        const current = answers.current
        if (current === "down") return Effect.fail(new UpstreamFailure({ upstream: "clef", message: "unavailable" }))
        return Effect.succeed(new Map([...questions.keys()].map((id) => [id, current.get(id) ?? 0])))
      })
  }))

/** Delivery, machine tokens and their dependencies, real over the in-memory D1, with a scripted classifier. */
export const deliveryServices = (events: Array<AuditEvent>, answers: ClassifierAnswers = classifierAnswers()) =>
  Layer.mergeAll(SecretDelivery.layer, DeliverySettings.layer, MachineTokens.layer, MachineTokenAuthenticator.layer, TokenAuthenticator.layer, Offboarding.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(DeliveryGuards.layer, RateLimiter.memory, Principals.layer)),
    Layer.provideMerge(Layer.mergeAll(MachineTokensRepo.layer, GuardsRepo.layer, UsersRepo.layer, OrgsRepo.layer, ConnectionsRepo.layer, fakeClassifier(answers))),
    Layer.provideMerge(resourceServices(events))
  )

export const admin = userPrincipal({ role: RoleSlug.make("admin"), permissions: ["resources:read", "resources:manage", "tokens:manage", "grants:manage"] })
export const member = userPrincipal()
export const asMember = (principal: Principal = member): DeliveryCaller => ({ _tag: "Member", principal })

/** Creates a secret through `Resources` (so its value is really sealed) and optionally marks it deliverable. */
export const createSecret = (name: string, value: string, options: { deliverable?: boolean; projectId?: ProjectId; envName?: string } = {}) =>
  Effect.gen(function*() {
    const created = yield* Resources.use((resources) =>
      resources.create(admin, { name, description: "", projectId: options.projectId ?? null, config: { kind: "secret", value: R.make(value) } }))
    if (options.deliverable !== true && options.envName === undefined) return created
    return yield* DeliverySettings.use((settings) =>
      settings.update(admin, created.id, {
        ...(options.deliverable === true ? { delivery: "deliverable" as const } : {}),
        ...(options.envName === undefined ? {} : { envName: options.envName })
      }))
  }).pipe(Effect.orDie)

export const createVariable = (name: string, value: string, projectId: ProjectId | null = null) =>
  Resources.use((resources) => resources.create(admin, { name, description: "", projectId, config: { kind: "variable", value } })).pipe(Effect.orDie)

export const grant = (id: string, resource: Resource, action: "read" | "use" | "write" | "admin" = "use", options: { subject?: string; expiresAt?: DateTime.Utc } = {}) =>
  insertRow("grants", {
    id,
    orgId,
    subject: JSON.stringify({ type: "user", id: options.subject ?? userId }),
    subjectType: "user",
    subjectId: options.subject ?? userId,
    resourceId: resource.id,
    action,
    conditions: "{}",
    expiresAt: options.expiresAt === undefined ? null : DateTime.formatIso(options.expiresAt),
    createdBy: userId,
    createdAt: DateTime.formatIso(now)
  })

export const activeGuard = (id: string, mode: GuardMode, resourceIds: ReadonlyArray<ResourceId> = []) =>
  insertRow("guards", {
    id: GuardId.make(id),
    orgId,
    projectId: null,
    resourceIds: JSON.stringify(resourceIds),
    name: id,
    nameFollowsRule: 0,
    rule: "Never deliver STRIPE_LIVE_KEY outside the deploy team",
    mode,
    approvers: "[]",
    threshold: 0.5,
    status: "active",
    compiled: JSON.stringify({ instructions: "Does the action deliver STRIPE_LIVE_KEY to someone outside the deploy team?", examples: [] }),
    compiledVersion: 1,
    createdBy: userId,
    createdAt: DateTime.formatIso(now)
  })

export const deliver = (caller: DeliveryCaller, request: DeliverSecretsRequest) =>
  SecretDelivery.use((delivery) => delivery.deliver(caller, request))

/** Env as a plain record, for assertions. */
export const envOf = (env: ReadonlyArray<{ readonly name: string; readonly value: R.Redacted<string> }>) =>
  Object.fromEntries(env.map((entry) => [entry.name, R.value(entry.value)]))

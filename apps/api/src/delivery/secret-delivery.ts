import {
  actionImplies,
  type DeliverSecretsRequest,
  type DeliveredSecrets,
  type DeliveredValue,
  type DeliveryCaller,
  Forbidden,
  hasPermission,
  type OrgId,
  type ProjectId,
  RateLimited,
  type Resource
} from "@pc/domain"
import { DateTime, Effect, Layer, Context, Option, Redacted } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { actorOf, machineActor } from "../audit/actor"
import { AuditLog } from "../audit/audit-log"
import { ResourcesRepo } from "../resources/resources-repo"
import { Secrets } from "../secrets/secrets"
import { DeliveryGuards } from "./delivery-guards"
import { type Entitlement, inProjectScope, listed, planDelivery } from "./delivery-plan"
import { DeliveryRateRules, RateLimiter } from "./rate-limiter"

type Failure = Forbidden | RateLimited

const orgOf = (caller: DeliveryCaller): OrgId => (caller._tag === "Machine" ? caller.token.orgId : caller.principal.orgId)

/** The request may narrow to a project, never escape the one a token is bound to. */
const scopeOf = (fixed: ProjectId | null, requested: ProjectId | undefined): Effect.Effect<ProjectId | null, Forbidden> =>
  fixed !== null && requested !== undefined && requested !== fixed
    ? Effect.fail(new Forbidden({ message: "this token is scoped to another project" }))
    : Effect.succeed(requested ?? fixed)

/**
 * `POST /api/secrets/deliver`: the only path on which secret plaintext leaves Smartplane, and only for
 * secrets marked `deliverable`. Members get what they hold a live `use` grant on (the gateway's own
 * resolution); machine tokens get their allow-list. Each delivered value is one `secret.delivered` event.
 */
export class SecretDelivery extends Context.Service<SecretDelivery, {
  readonly deliver: (caller: DeliveryCaller, request: DeliverSecretsRequest) => Effect.Effect<DeliveredSecrets, Failure>
}>()("api/delivery/SecretDelivery") {
  static readonly layer = Layer.effect(
    SecretDelivery,
    Effect.gen(function*() {
      const resources = yield* ResourcesRepo
      const policy = yield* AccessPolicy
      const secrets = yield* Secrets
      const guards = yield* DeliveryGuards
      const limiter = yield* RateLimiter
      const audit = yield* AuditLog

      const rateLimit = Effect.fn("SecretDelivery.rateLimit")(function*(caller: DeliveryCaller) {
        const [key, rule] = caller._tag === "Machine"
          ? [`machine:${caller.token.id}`, DeliveryRateRules.machine]
          : [`member:${caller.principal.tokenId ?? (caller.principal._tag === "User" ? caller.principal.userId : "")}`, DeliveryRateRules.member]
        const decision = yield* limiter.hit(key, rule)
        if (decision._tag === "Limited") return yield* new RateLimited({ retryAfterSeconds: decision.retryAfterSeconds })
      })

      /** In-scope candidates and what the caller is entitled to among them. */
      const entitlementOf = Effect.fn("SecretDelivery.entitlement")(function*(caller: DeliveryCaller, live: ReadonlyArray<Resource>, project: ProjectId | null) {
        if (caller._tag === "Machine") {
          const allowed = new Set(caller.token.allow)
          const entitlement: Entitlement = { receives: (resource) => allowed.has(resource.id), knows: (resource) => allowed.has(resource.id) }
          const scoped = listed(live, allowed)
          return { inScope: project === null ? scoped : inProjectScope(scoped, project), entitlement }
        }
        const principal = { ...caller.principal, projectId: project }
        const access = yield* policy.resolve(principal)
        const manager = hasPermission(principal, "resources:manage")
        const catalogue = manager || hasPermission(principal, "resources:browse") || hasPermission(principal, "grants:manage")
        const entitlement: Entitlement = {
          receives: (resource) => {
            const grant = access.get(resource.id)
            return grant !== undefined && actionImplies(grant.action, "use")
          },
          knows: (resource) => access.has(resource.id) || manager || (catalogue && resource.config.kind === "variable")
        }
        return { inScope: inProjectScope(live, project), entitlement }
      })

      const deliver = Effect.fn("SecretDelivery.deliver")(function*(caller: DeliveryCaller, request: DeliverSecretsRequest) {
        if (caller._tag === "Member" && caller.principal._tag === "ServiceAccount") {
          return yield* new Forbidden({ message: "service-account tokens cannot receive secrets; use a machine token" })
        }
        yield* rateLimit(caller)
        const orgId = orgOf(caller)
        const project = yield* scopeOf(caller._tag === "Machine" ? caller.token.projectId : caller.principal.projectId, request.projectId)
        const live = [...(yield* resources.ofKind(orgId, "secret")), ...(yield* resources.ofKind(orgId, "variable"))]
        const { inScope, entitlement } = yield* entitlementOf(caller, live, project)
        const plan = planDelivery(inScope, entitlement, request.names)

        const actor = caller._tag === "Machine" ? machineActor(caller.token.id) : actorOf(caller.principal)
        const context = {
          purpose: request.purpose,
          projectId: project,
          tokenKind: caller._tag === "Machine" ? "machine" : "user",
          ...(caller._tag === "Machine" ? { machineTokenId: caller.token.id, machineName: caller.token.name } : {})
        }
        const verdicts = yield* guards.evaluate(orgId, caller, plan.deliver.map(({ name, resource }) => ({ name, resource, purpose: request.purpose })))
        const denied = [...plan.denied]
        const env: Array<DeliveredValue> = []
        for (const { name, resource } of plan.deliver) {
          const target = { type: "resource" as const, id: resource.id }
          const verdict = verdicts.get(resource.id)
          if (verdict?._tag === "Deny") {
            yield* audit.record({ orgId, type: "policy.denied", actor, target, data: { ...context, action: "secret.deliver", name, reasons: verdict.reasons, scores: verdict.scores } })
            if (request.names !== undefined) denied.push({ name, reason: "policy" })
            continue
          }
          if (verdict !== undefined && verdict.flaggedBy.length > 0) {
            yield* audit.record({ orgId, type: "policy.flagged", actor, target, data: { ...context, action: "secret.deliver", name, flaggedBy: verdict.flaggedBy, scores: verdict.scores } })
          }
          const data = { ...context, name, kind: resource.config.kind }
          if (resource.config.kind === "variable") {
            yield* audit.record({ orgId, type: "secret.delivered", actor, target, data })
            env.push({ name, value: Redacted.make(resource.config.value), kind: "variable", version: DateTime.formatIso(resource.updatedAt ?? resource.createdAt), resourceId: resource.id })
            continue
          }
          const opened = yield* Effect.option(secrets.deliver(orgId, resource.id, { actor, data }))
          if (Option.isNone(opened)) {
            if (request.names !== undefined) denied.push({ name, reason: "unknown" })
            continue
          }
          env.push({ name, value: opened.value.value, kind: "secret", version: String(opened.value.version), resourceId: resource.id })
        }
        yield* Effect.annotateCurrentSpan({ "delivery.purpose": request.purpose, "delivery.delivered": env.length, "delivery.denied": denied.length })
        const result: DeliveredSecrets = { env, denied, expiresAt: caller._tag === "Machine" ? caller.token.expiresAt : null }
        return result
      })

      return SecretDelivery.of({ deliver })
    })
  )
}

import {
  actionImplies,
  type Conflict,
  deliverability,
  envNameOf,
  Forbidden,
  hasPermission,
  InvalidInput,
  NotFound,
  type Principal,
  type Resource,
  type ResourceConfig,
  type ResourceId,
  type UpdateDelivery
} from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { AuditLog } from "../audit/audit-log"
import { requireUser } from "../auth/permissions"
import { ResourcesRepo } from "../resources/resources-repo"
import { checkEnvNameUnique } from "./env-names"

type Failure = Forbidden | NotFound | Conflict | InvalidInput

const settingsOf = (resource: Resource) => ({
  delivery: deliverability(resource.config),
  envName: envNameOf(resource) ?? null,
  envNameSet: resource.config.kind === "secret" || resource.config.kind === "variable" ? resource.config.envName !== undefined : false
})

/** The config with `input` applied; `envName: null` drops the explicit name. Only secrets have a mode. */
const applied = (config: Extract<ResourceConfig, { kind: "secret" | "variable" }>, input: UpdateDelivery): ResourceConfig => {
  const { envName: _envName, ...rest } = config
  const envName = input.envName === undefined ? config.envName : input.envName ?? undefined
  const withName = envName === undefined ? rest : { ...rest, envName }
  return withName.kind === "secret" && input.delivery !== undefined ? { ...withName, delivery: input.delivery } : withName
}

/**
 * Whether a secret may leave Smartplane, and under which env name. A deliberate admin decision: it needs
 * `resources:manage` or an `admin` grant on the resource, and is audited as `secret.delivery_changed`.
 */
export class DeliverySettings extends Context.Service<DeliverySettings, {
  readonly update: (principal: Principal, id: ResourceId, input: UpdateDelivery) => Effect.Effect<Resource, Failure>
}>()("api/delivery/DeliverySettings") {
  static readonly layer = Layer.effect(
    DeliverySettings,
    Effect.gen(function*() {
      const repo = yield* ResourcesRepo
      const policy = yield* AccessPolicy
      const audit = yield* AuditLog

      const authorize = Effect.fn("DeliverySettings.authorize")(function*(principal: Principal, id: ResourceId) {
        if (hasPermission(principal, "resources:manage")) return
        const grant = (yield* policy.resolve(principal)).get(id)
        if (grant === undefined || !actionImplies(grant.action, "admin")) {
          return yield* new Forbidden({ message: "requires the resources:manage permission or an admin grant", permission: "resources:manage" })
        }
      })

      const update = Effect.fn("DeliverySettings.update")(function*(principal: Principal, id: ResourceId, input: UpdateDelivery) {
        yield* requireUser(principal)
        yield* authorize(principal, id)
        const current = yield* Effect.flatMap(repo.find(principal.orgId, id), Effect.fromOption).pipe(
          Effect.mapError(() => new NotFound({ entity: "resource", id }))
        )
        const config = current.config
        if (config.kind !== "secret" && config.kind !== "variable") {
          return yield* new InvalidInput({ message: "only secrets and variables are delivered", field: "delivery" })
        }
        if (config.kind === "variable" && input.delivery !== undefined && input.delivery !== "deliverable") {
          return yield* new InvalidInput({ message: "variables are always deliverable", field: "delivery" })
        }
        const next: Resource = { ...current, config: applied(config, input), updatedAt: yield* DateTime.now }
        if (envNameOf(next) === undefined && deliverability(next.config) === "deliverable") {
          return yield* new InvalidInput({ message: "the name yields no env name; set envName", field: "envName" })
        }
        yield* Effect.provideService(checkEnvNameUnique(next), ResourcesRepo, repo)
        yield* repo.update(next)
        yield* audit.by(principal, "secret.delivery_changed", { type: "resource", id }, {
          kind: config.kind,
          before: settingsOf(current),
          after: settingsOf(next)
        })
        return next
      })

      return DeliverySettings.of({ update })
    })
  )
}

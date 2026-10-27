import {
  actionImplies,
  type Conflict,
  type CreateResource,
  type EditableResourceConfig,
  Forbidden,
  hasPermission,
  InvalidInput,
  keepPinnedAuthServer,
  NotFound,
  type Principal,
  type Resource,
  type ResourceConfig,
  type ResourceFilter,
  type ResourceId,
  type RotateSecret,
  type SecretRotated,
  skillSourceOf,
  storedIntegrationConfig,
  type UpdateResource
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { creatorGrant, grantCreatedData, grantsToCreator } from "../access/creator-grant"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { IntegrationCatalog } from "../integrations/catalog"
import { checkEnvNameUnique } from "../delivery/env-names"
import { checkIntegrationConfig } from "../integrations/config-check"
import { upstreamToolsKey } from "../mcp/cache-keys"
import { ProjectsRepo } from "../org/projects-repo"
import { Ids } from "../platform/ids"
import { KvCache } from "../platform/kv"
import { Secrets } from "../secrets/secrets"
import { refuseBuiltin } from "../skills/builtin/builtin-skills"
import { checkReferences } from "./references"
import { ResourceVisibility } from "./resource-visibility"
import { ResourcesRepo } from "./resources-repo"

type Failure = Forbidden | NotFound | Conflict | InvalidInput

/**
 * What gets stored for an admin's config: integrations keep the OAuth2 state Smartplane manages, and MCP
 * servers keep the authorization server pinned for their OAuth client.
 */
const storedConfig = (input: EditableResourceConfig, current?: ResourceConfig): ResourceConfig => {
  // A variable's env name is a delivery setting (PATCH /resources/:id/delivery); editing its value keeps it.
  if (input.kind === "variable" && input.envName === undefined && current?.kind === "variable" && current.envName !== undefined) {
    return { ...input, envName: current.envName }
  }
  if (input.kind === "integration") return storedIntegrationConfig(input, current?.kind === "integration" ? current : undefined)
  if (input.kind !== "mcp_server" || current?.kind !== "mcp_server") return input
  const auth = keepPinnedAuthServer(input.auth, current.auth)
  return auth === undefined ? input : { ...input, auth }
}

export class Resources extends Context.Service<Resources, {
  readonly list: (principal: Principal, filter: ResourceFilter) => Effect.Effect<ReadonlyArray<Resource>, Forbidden>
  readonly get: (principal: Principal, id: ResourceId) => Effect.Effect<Resource, Forbidden | NotFound>
  readonly create: (principal: Principal, input: CreateResource) => Effect.Effect<Resource, Failure>
  readonly update: (principal: Principal, id: ResourceId, input: UpdateResource) => Effect.Effect<Resource, Failure>
  readonly remove: (principal: Principal, id: ResourceId) => Effect.Effect<void, Forbidden | NotFound>
  readonly rotateSecret: (principal: Principal, id: ResourceId, input: RotateSecret) => Effect.Effect<SecretRotated, Forbidden | NotFound | InvalidInput>
}>()("api/resources/Resources") {
  static readonly layer = Layer.effect(
    Resources,
    Effect.gen(function*() {
      const repo = yield* ResourcesRepo
      const projects = yield* ProjectsRepo
      const secrets = yield* Secrets
      const cache = yield* KvCache
      const audit = yield* AuditLog
      const catalog = yield* IntegrationCatalog
      const visibility = yield* ResourceVisibility
      const policy = yield* AccessPolicy
      const withRepo = Effect.provideService(ResourcesRepo, repo)

      const checkConfig = (orgId: Principal["orgId"], config: EditableResourceConfig) =>
        Effect.gen(function*() {
          yield* withRepo(checkReferences(orgId, config))
          if (config.kind === "integration") yield* Effect.provideService(checkIntegrationConfig(config), IntegrationCatalog, catalog)
        })

      const load = (principal: Principal, id: ResourceId) =>
        repo.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "resource", id })))

      const checkProject = (principal: Principal, projectId: Resource["projectId"]) =>
        projectId === null
          ? Effect.void
          : Effect.flatMap(projects.find(principal.orgId, projectId), (found) =>
            Option.isSome(found) ? Effect.void : Effect.fail(new NotFound({ entity: "project", id: projectId })))

      const create = Effect.fn("Resources.create")(function*(principal: Principal, input: CreateResource) {
        yield* requirePermission(principal, "resources:manage")
        const user = yield* requireUser(principal)
        yield* checkProject(principal, input.projectId)
        if (input.config.kind !== "secret") yield* checkConfig(principal.orgId, input.config)
        const resource: Resource = {
          id: yield* Ids.resource,
          orgId: principal.orgId,
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          // The secret value is sealed into a version below and never becomes part of the resource.
          config: input.config.kind === "secret" ? { kind: "secret" } : storedConfig(input.config),
          createdBy: user.userId,
          createdAt: yield* DateTime.now,
          updatedAt: null
        }
        // Every creation path ends here, so none can miss the creator's grant (see creator-grant.ts).
        const grant = grantsToCreator(resource.config.kind) ? yield* creatorGrant(resource, user.userId) : undefined
        yield* withRepo(checkEnvNameUnique(resource))
        yield* repo.insert(resource, grant === undefined ? [] : [grant])
        yield* audit.by(principal, "resource.created", { type: "resource", id: resource.id }, { kind: resource.config.kind, name: resource.name })
        if (grant !== undefined) yield* audit.by(principal, "grant.created", { type: "grant", id: grant.id }, grantCreatedData(grant, { reason: "creator" }))
        if (input.config.kind === "secret") yield* secrets.store(resource.id, input.config.value, user.userId)
        return resource
      })

      const update = Effect.fn("Resources.update")(function*(principal: Principal, id: ResourceId, input: UpdateResource) {
        yield* requirePermission(principal, "resources:manage")
        yield* refuseBuiltin(id)
        const current = yield* load(principal, id)
        if (input.config !== undefined && input.config.kind !== current.config.kind) {
          return yield* new InvalidInput({ message: `config must stay of kind ${current.config.kind}`, field: "config" })
        }
        // A skill's versions belong to its source; switching source would orphan them.
        if (input.config?.kind === "skill" && current.config.kind === "skill" && skillSourceOf(input.config) !== skillSourceOf(current.config)) {
          return yield* new InvalidInput({ message: `a ${skillSourceOf(current.config)} skill cannot become a ${skillSourceOf(input.config)} skill`, field: "config" })
        }
        if (input.config !== undefined) yield* checkConfig(principal.orgId, input.config)
        if (input.projectId !== undefined) yield* checkProject(principal, input.projectId)
        const config = input.config === undefined ? current.config : storedConfig(input.config, current.config)
        const next: Resource = { ...current, ...input, config, updatedAt: yield* DateTime.now }
        yield* withRepo(checkEnvNameUnique(next))
        yield* repo.update(next)
        yield* audit.by(principal, "resource.updated", { type: "resource", id }, { fields: Object.keys(input) })
        if (next.config.kind === "mcp_server") yield* cache.remove(upstreamToolsKey(id))
        return next
      })

      /** The token secret Smartplane created for an OAuth2 integration has no other owner: it goes with the integration. */
      const managedSecretOf = (config: ResourceConfig): ResourceId | undefined =>
        config.kind === "integration" && config.connection.type === "oauth2" ? config.connection.tokenSecretId : undefined

      const remove = Effect.fn("Resources.remove")(function*(principal: Principal, id: ResourceId) {
        yield* requirePermission(principal, "resources:manage")
        yield* refuseBuiltin(id)
        const user = yield* requireUser(principal)
        const resource = yield* load(principal, id)
        yield* repo.remove(principal.orgId, id, user.userId)
        yield* audit.by(principal, "resource.deleted", { type: "resource", id })
        yield* cache.remove(upstreamToolsKey(id))
        const tokenSecretId = managedSecretOf(resource.config)
        if (tokenSecretId !== undefined && Option.isSome(yield* repo.find(principal.orgId, tokenSecretId))) {
          yield* repo.remove(principal.orgId, tokenSecretId, user.userId)
          yield* audit.by(principal, "resource.deleted", { type: "resource", id: tokenSecretId }, { reason: "integration_deleted", integrationId: id })
        }
      })

      /** Rotating needs `resources:manage` or a `write` grant on the secret (read ⊂ use ⊂ write ⊂ admin). */
      const canRotate = (principal: Principal, id: ResourceId) =>
        hasPermission(principal, "resources:manage")
          ? Effect.void
          : Effect.flatMap(policy.resolve(principal), (access) => {
            const grant = access.get(id)
            return grant !== undefined && actionImplies(grant.action, "write")
              ? Effect.void
              : Effect.fail(new Forbidden({ message: "requires the resources:manage permission or a write grant", permission: "resources:manage" }))
          })

      const rotateSecret = Effect.fn("Resources.rotateSecret")(function*(principal: Principal, id: ResourceId, input: RotateSecret) {
        yield* canRotate(principal, id)
        const user = yield* requireUser(principal)
        const resource = yield* load(principal, id)
        if (resource.config.kind !== "secret") return yield* new InvalidInput({ message: "only secrets can be rotated" })
        const version = yield* secrets.store(id, input.value, user.userId)
        yield* audit.by(principal, "secret.rotated", { type: "resource", id }, { version })
        const rotated: SecretRotated = { resourceId: id, version }
        return rotated
      })

      return Resources.of({
        list: Effect.fn("Resources.list")(function*(principal: Principal, filter: ResourceFilter) {
          yield* requirePermission(principal, "resources:read")
          return yield* visibility.filter(principal, yield* repo.list(principal.orgId, filter))
        }),
        get: Effect.fn("Resources.get")(function*(principal: Principal, id: ResourceId) {
          yield* requirePermission(principal, "resources:read")
          return yield* visibility.find(principal, id)
        }),
        create,
        update,
        remove,
        rotateSecret
      })
    })
  )
}

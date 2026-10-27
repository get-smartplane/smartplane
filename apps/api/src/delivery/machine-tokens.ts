import {
  type CreatedMachineToken,
  type CreateMachineToken,
  deliverability,
  Forbidden,
  hasPermission,
  InvalidInput,
  type MachineToken,
  type MachineTokenId,
  MachineTokenPrefix,
  MaxTokenTtlDays,
  NotFound,
  type Principal,
  type RenewMachineToken
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Redacted } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireSession, requireUser } from "../auth/permissions"
import { ProjectsRepo } from "../org/projects-repo"
import { AppConfig } from "../platform/config"
import { randomHex, sha256Hex } from "../platform/encoding"
import { Ids } from "../platform/ids"
import { ResourcesRepo } from "../resources/resources-repo"
import { MachineTokensRepo } from "./machine-tokens-repo"

/** Reviewers revoke what an access review turns up without also needing `tokens:manage`. */
const requireAny = (principal: Principal, permissions: ReadonlyArray<"tokens:manage" | "reviews:manage">) =>
  permissions.some((permission) => hasPermission(principal, permission))
    ? Effect.void
    : Effect.fail(new Forbidden({ message: `requires one of: ${permissions.join(", ")}` }))

export class MachineTokens extends Context.Service<MachineTokens, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<MachineToken>, Forbidden>
  readonly create: (principal: Principal, input: CreateMachineToken) => Effect.Effect<CreatedMachineToken, Forbidden | NotFound | InvalidInput>
  readonly renew: (principal: Principal, id: MachineTokenId, input: RenewMachineToken) => Effect.Effect<MachineToken, Forbidden | NotFound>
  readonly revoke: (principal: Principal, id: MachineTokenId) => Effect.Effect<void, Forbidden | NotFound>
}>()("api/delivery/MachineTokens") {
  static readonly layer = Layer.effect(
    MachineTokens,
    Effect.gen(function*() {
      const repo = yield* MachineTokensRepo
      const resources = yield* ResourcesRepo
      const projects = yield* ProjectsRepo
      const config = yield* AppConfig
      const audit = yield* AuditLog
      const notFound = (id: MachineTokenId) => new NotFound({ entity: "token", id })

      /** Every entry must be a live, deliverable secret or variable the token's project can reach. */
      const checkAllowList = Effect.fn("MachineTokens.checkAllowList")(function*(principal: Principal, input: CreateMachineToken) {
        const projectId = input.projectId ?? null
        const ids = [...new Set(input.allow)]
        const found = new Map((yield* resources.findMany(principal.orgId, ids)).map((resource) => [resource.id, resource]))
        for (const id of ids) {
          const resource = found.get(id)
          const fail = (issue: string) => Effect.fail(new InvalidInput({ message: `${id} ${issue}`, field: "allow" }))
          if (resource === undefined) return yield* fail("is not a resource of this organization")
          if (resource.config.kind !== "secret" && resource.config.kind !== "variable") return yield* fail("is not a secret or variable")
          if (deliverability(resource.config) !== "deliverable") return yield* fail("is not deliverable; mark it deliverable first")
          if (projectId !== null && resource.projectId !== null && resource.projectId !== projectId) return yield* fail("belongs to another project")
        }
        return ids
      })

      const create = Effect.fn("MachineTokens.create")(function*(principal: Principal, input: CreateMachineToken) {
        yield* requirePermission(principal, "tokens:manage")
        yield* requirePermission(principal, "resources:manage")
        const user = yield* requireSession(principal)
        const projectId = input.projectId ?? null
        if (projectId !== null && Option.isNone(yield* projects.find(principal.orgId, projectId))) {
          return yield* new NotFound({ entity: "project", id: projectId })
        }
        const allow = yield* checkAllowList(principal, input)
        const plaintext = `${MachineTokenPrefix}${randomHex(32)}`
        const now = yield* DateTime.now
        const token: MachineToken = {
          id: yield* Ids.machineToken,
          orgId: principal.orgId,
          name: input.name,
          prefix: plaintext.slice(0, 12),
          projectId,
          allow,
          createdBy: user.userId,
          createdAt: now,
          expiresAt: DateTime.add(now, { days: input.ttlDays ?? MaxTokenTtlDays }),
          lastUsedAt: null,
          lastUsedIp: null,
          revokedAt: null
        }
        yield* repo.insert(token, yield* Effect.promise(() => sha256Hex(plaintext)))
        yield* audit.by(principal, "machine_token.created", { type: "token", id: token.id }, {
          name: token.name,
          projectId,
          allow,
          expiresAt: DateTime.formatIso(token.expiresAt)
        })
        const created: CreatedMachineToken = { token, plaintext: Redacted.make(plaintext), deliverUrl: `${config.API_URL}/api/secrets/deliver` }
        return created
      })

      const renew = Effect.fn("MachineTokens.renew")(function*(principal: Principal, id: MachineTokenId, input: RenewMachineToken) {
        yield* requirePermission(principal, "tokens:manage")
        yield* requirePermission(principal, "resources:manage")
        yield* requireSession(principal)
        const current = yield* Effect.flatMap(repo.find(principal.orgId, id), Effect.fromOption).pipe(Effect.mapError(() => notFound(id)))
        const expiresAt = DateTime.add(yield* DateTime.now, { days: input.ttlDays ?? MaxTokenTtlDays })
        if (!(yield* repo.renew(principal.orgId, id, expiresAt))) return yield* notFound(id)
        yield* audit.by(principal, "machine_token.renewed", { type: "token", id }, {
          previousExpiresAt: DateTime.formatIso(current.expiresAt),
          expiresAt: DateTime.formatIso(expiresAt)
        })
        const renewed: MachineToken = { ...current, expiresAt }
        return renewed
      })

      const revoke = Effect.fn("MachineTokens.revoke")(function*(principal: Principal, id: MachineTokenId) {
        yield* requireAny(principal, ["tokens:manage", "reviews:manage"])
        const user = yield* requireUser(principal)
        if (!(yield* repo.revoke(principal.orgId, id, user.userId))) return yield* notFound(id)
        yield* audit.by(principal, "machine_token.revoked", { type: "token", id })
      })

      return MachineTokens.of({
        list: Effect.fn("MachineTokens.list")(function*(principal: Principal) {
          yield* requireAny(principal, ["tokens:manage", "reviews:manage"])
          return yield* repo.list(principal.orgId)
        }),
        create,
        renew,
        revoke
      })
    })
  )
}
